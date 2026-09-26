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

- Harness работает только на **real PostgreSQL**; при отсутствии доступного экземпляра suite падает с явной ошибкой, а не переходит на mock/SQLite. `APP_ENV=test` и переданный URL сами по себе **не** разрешают тест. До migrations, seed, test writes и любого destructive setup/cleanup preflight по read-only connection подтверждает одновременно: `APP_ENV=test`; `current_database()` имеет test-only имя `tg026_<run_id>_tg026_test` (если выделяется отдельная schema, она также имеет `tg026_<run_id>_tg026_test`); target создан или зарезервирован trusted test harness/provisioner для этого запуска; серверный ownership marker target и выданный provisioner receipt совпадают по `run_id`, target identity и owner token. Harness хранит receipt и знает, какой target ему принадлежит; arbitrary supplied URL, имя без marker, production-like target и чужой/неподтверждённый marker отвергаются до writes. Preflight фиксирует isolation/серверные настройки и результат в machine-readable report.
- Provisioning детерминирован: provisioner создаёт отдельную disposable test database (и test-only schema, если требуется) с server-side ownership marker для прогона; миграции применяет migration/provisioning role через `migrateToLatest` из `@max-smart-city/db` (никакого ручного DDL вместо canonical migrator), затем TG-008 seed CLI/manifest. Harness не принимает существующую произвольную database/schema как disposable target. Параллельные test workers не делят изменяемое состояние: каждый scenario получает собственный tenant/Case, общий read-only setup допускается. Cleanup после success и test failure удаляет только target с повторно проверенными naming rule, receipt и server-side ownership marker; после interrupted run provisioner выполняет best-effort recovery cleanup по тому же receipt/marker с повторной read-only проверкой, иначе оставляет target и сообщает blocker. Никаких destructive setup/cleanup против произвольного или production-like target.
- Provisioning/migrations и runtime используют **разные PostgreSQL roles**: migration/provisioning role может создавать test database/schema и применять canonical migrations; runtime application role получает только production-equivalent privileges на test target, без superuser, DDL, bypass/disable triggers и административного cleanup. Harness проверяет identity и effective grants обеих roles до suites. Business commands и negative DML выполняются с runtime role; privileged role не служит доказательством production enforcement.
- Fixtures разрешаются по **стабильным business keys** TG-008 manifest (никаких захардкоженных «случайных» UUID, `display_name` или `sequence`-зависимых ID). Акторам соответствуют ровно четыре role views из manifest.
- Общий snapshot/diff helper: нормализованное представление строки (typed values + канонический JSON для JSONB, побитовое для `bytes`) и сравнение до/после. Каждая проверка immutability/idempotency/restart опирается на **persisted rows**, а не только на HTTP-ответ.

### 7.2 Controlled parallel transactions

- Обычные Case/config command races используют две независимые реальные сессии/соединения и детерминированный interleaving: hold-point на канонической точке lock (reservation → Case row → config rows по global order §29.4), затем вторая сессия конкурирует за тот же lock; проверяются оба порядка. R12 — отдельный `FOR UPDATE SKIP LOCKED` protocol §7.4: второй worker **не** становится обычным lock waiter.
- Harness даёт `race`-helper только для barrier/hold-point/await-commit, а не для бизнес-решений: он не добавляет к production statements locks, hints, retries или `SET` параметров, отсутствующих в canonical protocol. Никакой глобальный sleep, произвольный timeout-as-correctness или «подождать и посмотреть» вместо явного barrier.
- Assertion после завершения обеих сессий: committed rows, cardinality по family, применимые `Case.revision`/`event_seq`/`command_id`, отсутствие orphan `CommandExecution`/intent; для R12 вместо Case revision проверяются claim token, lease/attempt/status и отсутствие duplicate intent.

### 7.3 First valid wins — только для canonical conflicting commands

First-valid-wins и semantic `409` применяются только к exact-target/Case conflicts, для которых это установлено owning upstream contract. Cardinality и outcome определяются **по каждой строке** §7.4 и каждой config family §7.6; same-key replay, `422` inactive dependency, два последовательных valid config commits и `SKIP LOCKED` skip не являются универсальным «loser 409». Failed command не оставляет частичных effects/events/intents и не изменяет authoritative rows; успешные serial operations сохраняют **оба** собственных effect sets, если upstream разрешает оба commit. Наблюдаемым считается canonical outcome owning модуля (in-process вызов command entry point на реальной БД и реальном transaction kernel); HTTP wire/middleware conformance — зона TG-027. Недоступный без TG-029 registry entry point — blocker owning dependency/integration, а не правка `app.ts`.

### 7.4 Race matrix (обязательный минимум)

Каждая применимая пара выполняется в обоих порядках на TG-008 fixtures, с проверкой persisted rows и **собственной** cardinality/outcome из owning contract. Для R12 «оба порядка» означает смену того, какой worker первым держит claimable row, а не ожидание lock вторым worker.

| # | Гонка | Обязательный исход |
|---|---|---|
| R1 | `accept \|\| reject` одного Assignment | ровно одно `PENDING→ACCEPTED\|REJECTED`; second decision запрещён, different-key loser получает owning semantic `409`; один decision effect set |
| R2 | late action на **old Assignment** (accept/reject/result) после смены current context | old-target action даёт `STALE_ASSIGNMENT`/current-context `409`; ноль effects от него, новый current executor/iteration неизменны |
| R3 | duplicate `SubmitResult` одной iteration | ровно один `Result` по `UNIQUE(iteration_id)`, один EVT-008 и один `RESULT_READY` intent; visible second different-key submit — `409 INVALID_STATE`/canonical current-context conflict TG-015 без второго effect set, same-key — TG-012 replay |
| R4 | `confirmation \|\| remark` одного Result | ровно одна formal branch (`UNIQUE(result_id)`) и её один EVT-010 **или** EVT-011; visible second different-key action — `409 FEEDBACK_ALREADY_SUBMITTED`/owning current-context conflict TG-016, same-key — replay; ноль effects второй branch |
| R5 | `ReturnToRework \|\| disputed completion` | rework-first: одна N+1 и EVT-013/014, disputed loser current-context `409`; completion-first: один EVT-017 и `COMPLETED`, rework loser `409 TERMINAL_CASE`; event sets не смешиваются |
| R6 | `completion \|\| late remark` (fixture без feedback, с EVT-015 и отдельным valid manual basis) | completion-first: один terminal EVT-016, remark loser `TERMINAL_CASE`; remark-first: одна REMARK/EVT-011 и **ноль** terminal completion, прежний no-feedback basis invalid/current-state conflict по TG-016; не требовать terminal outcome в этом порядке |
| R7 | duplicate RecordNoFeedback/EVT-015 | ровно один EVT-015 на Result (non-null `result_id` CHECK + partial unique); different key — `409 NO_FEEDBACK_ALREADY_RECORDED`, same key — TG-012 replay, без второго event |
| R8 | concurrent **same** `Idempotency-Key` и fingerprint | ровно один reservation owner/committed business effect set/`SUCCEEDED`; второй ждёт и получает exact stored status/body replay, без второго fact |
| R9 | same key + **changed** payload / multipart file bytes | после security gate ровно один исходный committed effect set; contender получает `409 IDEMPOTENCY_KEY_REUSE`, ноль новых writes |
| R10 | config races (см. 7.6) | cardinality и outcomes по каждой family §7.6: в частности два serial valid config writes могут оба commit с двумя audit effect sets |
| R11 | stale `SendAssignment` по **old Selection** | `STALE_SELECTION` `409`; ноль новых Assignment/EVT-004/command success от stale action, current Selection не retarget'ится |
| R12 | two-worker `NotificationIntent` claim/lease | один claim owner на данный intent в момент claim, второй skip без blocking/duplicate claim; после lease expiry reclaim **той же** строки с новым token, stale token не finalize; status/attempt/lease по TG-019 |

**R12 protocol отдельно от command barrier:** worker A через существующий TG-019 claim entry point входит в короткую canonical claim transaction и удерживает lock на claimable intent до контролируемого release; test-only hold-point должен быть доступен без изменения production claim SQL. После подтверждения hold-point worker B выполняет **тот же production claim query `FOR UPDATE SKIP LOCKED`** в собственной DB session. До release A query B должен завершиться без ожидания A lock и не вернуть этот intent (он может получить другую due row либо пустой набор); bounded watchdog допускается только как сигнал зависшего теста, не как sleep/poll assertion. Затем A commit, snapshot подтверждает единственный claim/token и отсутствие duplicate claim. Отдельно через typed TG-019 lease/retry values воспроизвести crash/expiry: reclaim того же intent с новым token/attempt, старый token не finalize, допустимый finalize/retry/redrive сохраняет canonical status и не создаёт новых `Result`/EVT-008/intent. Повторить со сменой A/B. Если owning entry point не даёт такого hold-point, запросить seam у TG-019/Integration Agent как blocker, а не имитировать worker другим SQL. Никакого network call под claim lock и никакой сериализации worker clients.

### 7.5 Immutability regression (real attempted UPDATE/DELETE)

Матрица выполняется прямым SQL на real PostgreSQL по persisted canonical facts **под production-equivalent runtime application role** из §7.1, никогда под migration/provisioning role или superuser. Provisioner выставляет production-equivalent privileges до теста; harness проверяет `current_user`/effective grants. Для каждой строки: снимок до → попытка `UPDATE`/`DELETE` в отдельной runtime-role transaction (откат/ошибка) → перечитывание persisted authoritative row → byte/semantic equality. Отказ обязан прийти от DB (ожидаемый SQLSTATE permission/constraint/trigger), а не от application code. Если invariant защищён trigger'ом, negative test всё равно исполняется runtime role и проверяет trigger refusal; privileged failure/success не доказывает production enforcement. Для разрешённого one-way transition используется owning command/runtime role; запрещённые повторные или обратные DML проверяются runtime role с неизменностью authoritative row.

Обязательный охват: `Result` (полностью); `ResidentFeedback` (полностью); `Comment` (business history); `Attachment` **bytes**; `Attachment` immutable metadata **после** business association; `ContractorSelection` identity (case/iteration/contractor/selected actor/time); immutable `Assignment` identity (case/selection/contractor/created iteration/sent actor/time); one-way `Assignment` decision (`PENDING→ACCEPTED|REJECTED` — ровно один раз: повторное решение, смена terminal decision и обратный переход отвергаются); `CaseEvent` (append-only, `event_seq` и payload); успешный `CommandExecution` (principal/key/fingerprint/command identity и canonical response после `SUCCEEDED`; единственный normal transition `IN_PROGRESS→SUCCEEDED`).

Дополнительно обязательный constraint-negative regression по Data Model §§24–26: cross-tenant FK (organization/house/premises/category), same-case current pointers, same-case child relations, `EVT_015 => result_id IS NOT NULL`, `UNIQUE(result_id,event_type) WHERE EVT_015`, `UNIQUE(case_id,event_seq)`, closure consistency, `UserRoleBinding` role shape, `MaxIdentity` readiness CHECK, DemoRun↔Case same-run, circular Case↔CaseIteration bootstrap.

### 7.6 Config races (финальная семантика TG-018)

Обязательные пары в обоих порядках, с committed-row проверкой и без изменения §29.4; для каждой family ожидаются собственные serial outcomes TG-018:

| Family | Create/command-first или первый config write | Config-first или второй config write | Persisted cardinality |
|---|---|---|---|
| deactivate **House** / **Category** vs `CreateCase` | Valid CreateCase с coherent old snapshot commit, затем deactivation также commit | Deactivation commit; следующий CreateCase получает canonical validation failure для inactive target | Create-first: **два valid commits**, один Case/EVT-001 и один config audit; deactivate-first: ноль create effects, один config audit |
| Category requirement/default update vs `CreateCase` | CreateCase сохраняет целиком old snapshot, затем update commit | Update commit, затем CreateCase сохраняет целиком new snapshot | Оба valid commits, один Case/EVT-001 и один config audit; никогда смешанный snapshot |
| **OrganizationContractor deactivation** vs `CreateCase` с non-null Category default | CreateCase commit с прежним coherent `default_contractor_snapshot_id`, затем deactivation commit | Deactivation commit; CreateCase получает canonical `422` inactive dependency, reservation и все create effects откатываются; Category default не очищается | Create-first: **два valid commits** (один Case/EVT-001, один config audit); deactivate-first: один config audit, ноль create effects |
| **OrganizationContractor deactivation** vs `SelectContractor` / `SendAssignment` | Valid dependent command commit до deactivation; последующая config mutation также commit и не меняет историю/target | После deactivation dependent command перечитывает current dependency и получает owning canonical rejection, без selection/assignment effects | Command-first: два valid commits и по одному effect set каждого; deactivation-first: один config effect set, ноль dependent-command effects |
| actor/access/binding old/new rows, включая absent child creation/reactivation | Каждый still-authorized valid write берёт affected rows в stable PK order; при изменении authority следующий command проходит current TG-011 gate | Такой же порядок при обратном interleaving; revoked/hidden command получает owning security outcome до revealing detail | По одному audit/success на каждый committed config write; denied command не пишет, foreign rows неизменны |
| два F2 role-binding PUT с разными keys/UK roles | Первый valid PUT commit со своим composite audit | Второй still-authorized valid PUT применяет serial replacement к результату первого, со своим audit | **Два valid commits и два audit effect sets**; максимум одна active UK binding в `(app_user_id, organization_id)`, foreign bindings неизменны |
| F2 concurrent `house_ids` full-set PUT (`[A,B] → [B,C]`, повтор ID, `[]`) | Первый valid PUT сохраняет полный набор и audit | Второй still-authorized valid PUT заменяет весь набор и пишет свой audit | Два valid commits/два audit effect sets; final set равен последнему serial PUT, без дублей/лишних `UKHouseAccess` |
| два F4 PATCH **одной Category** с разными keys | Первый valid PATCH commit: `r→r+1`, свой actor и before/after audit | Второй valid PATCH commit: `r+1→r+2`, свой actor и before/after audit | **Два valid commits, два ConfigurationChange, два successful CommandExecution**; `config_revision=r+2`, без обязательного `409` |
| два F4 PATCH разных config entities с разными keys | Первый valid write commit с собственным audit/metadata | Второй valid write commit с собственным audit/metadata | Два valid commits и два audit effect sets; для каждой затронутой Category только собственный `config_revision+1` и `updated_by_user_id` |

Создание/reactivation отсутствующей child-строки не обходит сериализацию. Same-key replay не создаёт второй audit/revision, denied/invalid/rollback не меняет config metadata. Config write не создаёт `CaseEvent`, не меняет Case snapshots/history и не ретаргетит Selection/Assignment. Canonical error code в строках без явного кода берётся из owning command/security contract, а не придумывается TG-026.

### 7.7 Idempotency (TG-012)

Покрытие обязательно: same key + **тот же** request → stored status/body без новых writes/events/revision; same key + **изменённый** normalized body → `IDEMPOTENCY_KEY_REUSE`; same key + изменённые multipart **bytes** (и hash) при прежней metadata → conflict, тогда как transport boundary/header variation при тех же logical bytes fingerprint не меняет; replay после revoke (binding/access) **запрещён** до выдачи stored response; replay после contractor reassignment (old contractor) **запрещён**; authorized replay по неизменной authority возвращает exact canonical stored response без повторной business-transition валидации. Проверяется также, что loser не оставляет orphan `IN_PROGRESS`/`SUCCEEDED`, а rollback reservation исчезает.

### 7.8 Persistence / restart

Restart обязан доказать durability **без** правок compose/Dockerfile и без process-memory state: (a) полное закрытие пулов/соединений и reconnect даёт byte-identical authoritative data; (b) server-side завершение собственных test-сессий (`pg_terminate_backend`) и чтение после reconnect — те же snapshots, history, `CommandExecution` responses, attachments bytes; (c) test-only process seam через **уже существующие exported module/worker entry points direct dependencies**: harness запускает отдельный child process с конкретным entry point, выполняет owning command/worker operation на real PostgreSQL, останавливает process, сохраняет **ту же** disposable database, запускает новый process с тем же entry point и перечитывает Case/current projection, все iterations/selections/assignments/results/feedback/comments/events, configuration, users/bindings, MAX identity links, DemoRuns, command idempotency, attachments и notification intents/status. Это не требует final composed API process: TG-026 идёт parallel with TG-029 и не владеет final app registry. Запрещены второй registry, временная production app composition, правка `apps/api/src/app.ts` и TG-029 substitute. NotificationIntent `PENDING`/`RETRY` переживают restart; expired `CLAIMED`/`lease_expires_at` reclaim даёт тот же intent с новым `claim_token` и без дублей `Result`/EVT-008/intent; старый `claim_token` не может finalize. Ни один restart/lease шаг не создаёт второй business fact. Если после owning dependency нет требуемого exported entry point, это blocker/request владельцу и Integration Agent, а не основание менять production registry.

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
2) Integration Agent: test-only PostgreSQL provisioning lifecycle для suites:
   создание/резервация disposable `tg026_<run_id>_tg026_test` database (и такой же
   schema при необходимости), server-side ownership marker + receipt с run_id/owner
   token/target identity, отдельные migration/provisioning и production-equivalent
   runtime roles/grants, read-only preflight, cleanup после success/failure и
   best-effort interrupted-run recovery только после повторной проверки ownership.
   Arbitrary supplied/production-like target не разрешён; TG-030 compose/Docker
   не редактируются, TG-026 не получает ownership production provisioning code.
3) TG-008 owner: финальный implementation SHA, стабильный seed manifest/business keys и
   seed CLI entry point для fixtures.
4) TG-012 owner: финальный kernel/repository entry points и canonical error codes для
   проверки replay/409 в concurrency suites.
5) TG-019 owner: финальный implementation SHA, worker claim/lease/finalize/redrive entry
   points, test-only hold-point внутри существующей claim transaction для R12
   (если entry point его не предоставляет), typed значения `NOTIFICATION_LEASE_MS`,
   retry/attempt/backoff для детерминированных expired-lease сценариев; TG-026
   не получает ownership worker/production claim SQL.
6) TG-018 owner: финальный implementation SHA config command entry points для 7.6.
7) Owning direct dependencies / Integration Agent: если существующих exported
   command/worker entry points недостаточно для child-process restart §7.8,
   предоставить explicit test-only process seam к этим entry points без final
   composed API registry, app.ts и передачи TG-026 production code ownership.
```

Новых npm packages не требуется: `pg`/`kysely`/`vitest` уже присутствуют. Фактическая несовместимость любого upstream surface — конкретный interface/file request владельцу и Integration Agent до затронутой работы; upstream в TG-026 не править.

## 9. Acceptance criteria

Все обязательные гонки R1–R12 покрыты по соответствующему протоколу §7.2/§7.4 и дают **per-family cardinality/outcomes** §7.4/§7.6 без частичных effects: first-valid-wins только у canonical conflicting commands, R12 пропускает locked intent без ожидания, а valid serial config writes могут оба commit. Real PostgreSQL suite запускается лишь на подтверждённой disposable test database с ownership marker, разделёнными migration/runtime roles и безопасным cleanup §7.1. Immutability matrix §7.5 даёт DB-level отказ **под production-equivalent runtime role** на каждой запрещённой мутации с byte/semantic-equivalent authoritative value плюс полный constraint-negative regression §§24–26. Idempotency §7.7 закрывает все шесть сценариев, включая запрет replay после revoke и после contractor reassignment. Restart §7.8 через existing module/worker process seam сохраняет authoritative data и восстанавливает pending/retry/expired-claim без дублей `Result`/event/intent и без final TG-029 registry. Config races §7.6 соответствуют финальной семантике TG-018. Fixtures детерминированы по TG-008 business keys, без reset истории. Machine-readable report и fail-fast exit присутствуют. Production code не изменён; провалы возвращены owning task. Suite не содержит mock/альтернативной БД, sleep-as-correctness, сериализации клиента, skip или ослабленных assertions.

## 10. Required tests

На **будущей implementation stage** — только real PostgreSQL; после targeted suites запустить `npm run typecheck`, `npm run build`, `npm test` (upstream regressions зелёные) и документированную команду TG-026; `git diff --check <TG026_IMPLEMENTATION_BASE_SHA>`. Обязательный состав:

1. **Harness preflight/determinism и cleanup:** `APP_ENV=test` без receipt/marker отвергается; произвольный URL, production-like name, чужой owner token и несовпадение `current_database()`/schema с `tg026_<run_id>_tg026_test` fail closed **до writes**. Проверить положительный provisioner receipt + server-side ownership marker, runtime/migration role identity и grants, applied migrations, seed manifest namespace/version, business keys и ровно четыре role views; повторный прогон даёт тот же fingerprint, isolation/DB settings не изменены. Проверить cleanup после success/failure и best-effort interrupted-run recovery только своего target с повторной проверкой ownership; чужой target не удаляется.
2. **Constraint regression:** негативная матрика §§24–26 (FK/UNIQUE/CHECK/cross-tenant/current pointers/closure/role shape/MAX readiness/DemoRun↔Case/circular bootstrap) с проверкой, что отказ пришёл от DB.
3. **Immutability matrix:** attempted `UPDATE`/`DELETE` **под production-equivalent runtime role**, отдельно от migration/provisioning role, для всех фактов §7.5, вкл. Attachment bytes и post-association metadata, one-way Assignment decision (включая attempted второй decision), successful `CommandExecution` (principal/key/fingerprint/identity + canonical response); для trigger-protected invariants та же runtime role; каждый denied DML — DB SQLSTATE/trigger evidence и persisted authoritative snapshot до/после с byte/semantic equality. Superuser результат не засчитывается.
4. **Race matrix R1–R12:** R1–R11 используют controlled parallel transactions/ordinary lock interleavings; R12 отдельно доказывает `FOR UPDATE SKIP LOCKED` nonblocking skip, no duplicate claim, expired lease reclaim и token-guarded finalize без sleep-as-correctness. Для каждой family проверить свою §7.4/§7.6 cardinality/outcome, committed rows, `revision`, `event_seq`, `command_id` correlation и отсутствие orphan reservation/intent; valid serial config operations могут дать два commits.
5. **Idempotency §7.7:** six scenarios, включая boundary/header variation при неизменных bytes и запрет replay после revoke/reassignment.
6. **Config races §7.6:** все перечисленные пары в обоих порядках: CreateCase-first допускает два valid commits и coherent snapshot, deactivation-first блокирует новый CreateCase canonical inactive-target failure (F3 — `422`); F2 double-PUT/`house_ids` serial replacement сохраняет оба valid audit sets; два concurrent valid Category PATCH дают `r→r+1→r+2` и два audit rows; проверить отсутствие silent default clear/retarget/partial create.
7. **Restart/persistence §7.8:** reconnect, server-side session termination, child-process restart через existing exported module/worker entry points на той же real PostgreSQL database, pending/retry survival, expired-claim reclaim, отсутствие дублей `Result`/EVT-008/intent; final app registry/TG-029 не требуется.
8. **CI artifact:** отчёт содержит per-test outcome, environment fingerprint, exit code; suite падает при недоступном real PostgreSQL и при любом failure, без `passWithNoTests`.
9. **Scope guard:** `git diff --name-only <TG026_IMPLEMENTATION_BASE_SHA>` показывает только `tests/integration/db/**` и `tests/integration/concurrency/**` (+ согласованный shared-file route из §8).

На текущем authoring stage выполняется только self-check документа: ровно 12 Lean sections, канонические graph/SHA/sources/semantics, единственный изменённый файл, `git diff --check`. Runtime tests **NOT_RUN**, их PASS не заявляется; `test:integration` остаётся `NO_SUITE_YET` до TG-026 implementation.

## 11. Git / integration handoff

Authoring: изолированная ветка `codex/tg-026-contract` от `CONTRACT_BASE_SHA` §1, только `tasks/TG-026_TASK_CONTRACT.md`, self-check, commit/push **только этой ветки** с существующей human Git identity (без AI author/co-author/Generated-by подписей). Вернуть full contract SHA, base SHA, upstream SHA, remote SHA match и clean worktree. Без `main` push и без canonicalize `main`. Затем **один independent CRITICAL review** этого contract SHA; review проходит вне canonical repository, review artifacts не коммитятся. При `FIX_REQUIRED` — один полный batch findings → один batch fix → только targeted closure, без нового полного review chain. Implementation получает отдельный актуальный `BASE_SHA` и branch только после завершения **всех пяти** dependencies и PASS review; Integration Agent один собирает stable `main`, TG-026 его не canonicalize. PASS review не снимает implementation gate.

## 12. Blocker protocol

Остановить затронутую работу и сообщить точный источник/владельца/Integration Agent при: неверном `BASE_SHA` или недоступном обязательном upstream; `SPEC CONFLICT` (race/idempotency/immutability/config semantics, расходящиеся с Product Freeze/Product Spec); production-инварианте, который TG-026 не может доказать без изменения production (например, constraint отсутствует в миграциях TG-006/TG-007) — это возвращается owning task, а не чинится здесь; отсутствии подтверждённого disposable PostgreSQL target/ownership marker/безопасного cleanup либо production-equivalent runtime role; несовместимости фактических kernel/seed/config/worker entry points с §7; отсутствии после owning dependency test-only child-process seam к существующему entry point без TG-029 registry (не строить второй registry и не править `app.ts`); необходимости изменить compose/Dockerfile, migrations, root manifests или ослабить constraints; недоступности real PostgreSQL (не подменять mock/альтернативной БД); необходимости shared-file правки вне §8 route. Pending dependencies — gate, не blocker authoring/review. Review findings не превращать в новые process-артефакты.
