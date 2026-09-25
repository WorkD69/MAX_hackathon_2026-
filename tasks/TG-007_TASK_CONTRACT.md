# TG-007 TASK CONTRACT

> Lean Task Contract (Wave 2+). `CRITICAL`: один independent review в отдельном чистом чате до implementation. Этот commit содержит только контракт; review artifact в репозитории не создаётся.

## 1. Identity / BASE_SHA

```text
TASK_ID           = TG-007
TITLE             = Operational persistence: attachments, idempotency, outbox и config audit
TYPE              = DATA
EXECUTION_CLASS   = A — Implementation
RISK_CLASS        = CRITICAL
PRIMARY_OWNERSHIP = LANE-B
CONTRACT_BASE_SHA = 639f8c9ee02026741beb8aae723906dc9d6da9c6
UPSTREAM_TG006_CONTRACT_SHA = 753ffd47080e5ea570631e753ea63f7f9c8998f2
```

`CONTRACT_BASE_SHA` — проверенный `origin/main` при authoring, не разрешение начинать implementation от этой базы. Перед будущей implementation нужен отдельно установленный актуальный `BASE_SHA` после завершения TG-006 (§ 4, § 12); агент сверяет его с `git rev-parse HEAD`.

## 2. Goal

Завершить PostgreSQL persistence boundary для `Attachment` и typed links, `CommandExecution`, `NotificationIntent`, `ConfigurationChange`, а также прямо предусмотренных Data Model downstream operational links. Результат — новая версионированная миграция, Kysely type surface и доказательство DB constraints на реальном PostgreSQL. Этот контракт не реализует схему и не запускает бизнес-команды.

## 3. Canonical sources

Приоритет — `AGENTS.md`; `docs/01_PRODUCT_FREEZE.md` §§ 5, 8, 12 и `docs/02_PRODUCT_SPEC.md` §§ 3, 6–7, 13, 24 для продуктовой семантики. Технические границы: `docs/03_ARCHITECTURE.md` §§ 17–19; `docs/04_DATA_MODEL.md` §§ 1.5, 16–19, 24–29, 33; `docs/05_INTERFACE_CONTRACTS.md` §§ 5, 26, 28; `docs/07_DECISIONS.md` ADR-010/011/014/018/019/020/024/026. Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` § TG-007. Upstream: `tasks/TG-005_TASK_CONTRACT.md` (foundation/migration и PostgreSQL test infrastructure) и `tasks/TG-006_TASK_CONTRACT.md` **именно на** SHA выше (§§ 4, 7.8, 8); текущий `main` ещё не является подтверждением завершения TG-006.

## 4. Dependencies / unlocks

```text
Depends On:   TG-006
Unlocks:      TG-008, TG-012, TG-015, TG-017, TG-018, TG-019
Parallel With: TG-011, TG-021, TG-025
```

До implementation обязательны final closed TG-006 contract SHA, завершённая TG-006 implementation и её final implementation SHA. Отдельный contract-only repair `ck_feedback_remark` для `CONFIRMATION` (`remark_text IS NULL OR remark_text = ''`, non-empty запрещён) — upstream TG-006, вне scope TG-007. Не подменять им завершение TG-006 и не чинить его в TG-007. Task Graph не менять.

## 5. Allowed write scope

**Сейчас:** только `tasks/TG-007_TASK_CONTRACT.md`.

**Для будущей implementation после review и выполнения § 4:** новая `packages/db/migrations/*operational*`; DB type surface и относящиеся к четырём сущностям persistence repositories в `packages/db/src/**`; целевые DB unit/integration tests и минимальные обновления exact catalog/type assertions, необходимые для новой миграции. Shared files меняются только по согласованному ownership при интеграции. Никакая ранее применённая миграция не редактируется.

## 6. Forbidden scope

Не менять Product Freeze/Spec, Architecture, Data Model, Interface Contracts и Task Graph; не переписывать TG-005 foundation или TG-006 case-workflow migration. Не реализовывать TG-012 transaction runner, альтернативную idempotency/CAS модель, TG-018 configuration API, TG-019 MAX delivery worker, frontend или workflow handlers. Не использовать filesystem как authoritative attachment store, внешнюю очередь или новый intent при redrive. Ни network notification, ни product state machine в TG-007 не входят. На contract stage запрещены production code, migrations, manifests/lockfile и review artifacts.

## 7. Required behavior / invariants

- **Attachment (§ 16 Data Model).** `content bytea` в PostgreSQL — authoritative bytes; сохраняются `file_name`, `mime_type`, `byte_size`, `sha256`, uploader, Case и время. Typed `CaseInitialAttachment`, `WorkMaterialAttachment`, `ResultAttachment`, `FeedbackAttachment`, `CommentAttachment` links имеют same-Case integrity; work material связан с iteration и Assignment того же Case, Result/Feedback/Comment — с parent того же Case. После business association запрещённые `UPDATE` bytes, filename, hash и всех полей, меняющих authoritative business meaning/metadata, а также `DELETE`, отвергаются на DB boundary; исходная строка и связь не меняются. Исправление создаёт новую Attachment.
- **CommandExecution (§ 18).** Хранить `command_id`, discriminator `APP_USER | MAX_IDENTITY`, соответствующий ровно один principal ID, `idempotency_key`, `command_type`, nullable `case_id`, `request_hash`, status и canonical `http_status`/`response_body`/`completed_at`. После reservation principal/type/key, fingerprint и command identity неизменяемы. Ровно один нормальный переход `IN_PROGRESS → SUCCEEDED` заполняет canonical success response; после `SUCCEEDED` status и response не переписываются, arbitrary `DELETE` отвергается. `IN_PROGRESS` не содержит response/completion, `SUCCEEDED` содержит все три.
- **Idempotency (§ 18 Data Model, § 5 Interface Contracts).** Два partial unique ограничения: `(app_user_id, idempotency_key)` при `APP_USER` и `(max_identity_id, idempotency_key)` при `MAX_IDENTITY`. Одинаковые строки key у разных principals/discriminators не конфликтуют. Хранимый request hash поддерживает canonical JSON fingerprint и multipart fingerprint с SHA-256 фактических bytes каждого файла; транспортная multipart boundary не часть fingerprint. TG-007 предоставляет persistence, а reservation/replay/rollback transaction runner принадлежит TG-012.
- **NotificationIntent (§ 19).** Хранить exact recipient `MaxIdentity`, snapshot validated `delivery_chat_id/type`, Result/Case, `RESULT_READY`, payload, status, `dedupe_key`, attempt/retry/error/redrive fields и `claim_token`/`claimed_at`/`lease_expires_at`. Допустимы только `PENDING | RETRY | CLAIMED | DELIVERED | PERMANENT_FAILURE`; counters неотрицательны. Для `PENDING|RETRY` claim поля и `delivered_at` пусты, `next_attempt_at` задан; для `CLAIMED` все три claim поля заданы, `delivered_at` пуст; для `DELIVERED` задан `delivered_at`, claim поля пусты; для `PERMANENT_FAILURE` claim поля, `delivered_at` и `next_attempt_at` пусты. Обязательны `UNIQUE(dedupe_key)` и `UNIQUE(result_id, notification_kind)`. Persisted state допускает claim нового token для due или expired lease и finalize по актуальному token; redrive использует ту же строку. Отправка и управление worker принадлежат TG-019.
- **ConfigurationChange (§ 33).** Append-only audit fact с organization, entity type/id, action, before/after JSON, actor, timestamp и обязательным FK `command_id → CommandExecution`. Только TG-018 выполняет config API write и пишет audit в той же transaction; TG-007 задаёт таблицу и DB constraints. `ConfigurationChange` не `CaseEvent` и не product state.
- **Downstream links (§§ 17, 26.5).** В новой operational migration добавить обязательный `CaseEvent.command_id → CommandExecution.command_id` и nullable `CaseEvent.attachment_id → Attachment.attachment_id` с согласованностью Case для attachment; TG-006 оставляет эти колонки без FK. Не переписывать TG-006 migration и не менять смысл событий.

## 8. Dependency requests

`DEPENDENCY_REQUESTS = NONE`. Использовать уже имеющиеся Kysely, `pg` и инфраструктуру real-PostgreSQL integration tests. На contract stage не менять manifests/lockfile. Если implementation выявит реальную необходимость shared dependency, остановить затронутую часть и передать запрос владельцу shared files через Integration Agent.

## 9. Acceptance criteria

Новая миграция поверх завершённой TG-006 создаёт все четыре operational families, typed links, точные FK/unique/status constraints и DB-level immutability; clean migration, rollback и повторный up проходят. Cross-Case ссылки, недопустимые статусы/lease shapes, дубликаты principal/key и `(result_id, notification_kind)`, запрещённые UPDATE/DELETE и invalid audit references отвергаются. Разрешённый `IN_PROGRESS → SUCCEEDED` сохраняет canonical response, после чего второй переход и rewrite отвергаются. Успешный Result может иметь один `RESULT_READY` intent; повторная доставка/redrive не создаёт второго intent/Result. Никакой внешний вызов не требуется для persistence tests.

## 10. Required tests

Только **реальный PostgreSQL** даёт acceptance evidence; mock/SQLite не заменяет DB constraint tests. После implementation запустить из корня `npm run typecheck`, `npm run build`, `npm test` и целевой `npx vitest run packages/db/src/operational-persistence.integration.test.ts` (или согласованное имя целевого suite); сохранить зелёными upstream TG-005/TG-006 PostgreSQL suites. Целевой suite обязан доказать:

1. Attachment: valid typed association, cross-Case rejection, multipart byte hash persistence; запрещённые UPDATE `content`/`file_name`/`sha256`/business metadata и `DELETE` после association, с `SELECT` неизменной строки после каждой попытки.
2. CommandExecution: reservation, discriminator/identity shape и две partial uniqueness semantics; immutable principal/key/fingerprint/command identity; успешный `IN_PROGRESS → SUCCEEDED`, затем отказ второго transition, response rewrite и arbitrary `DELETE`, с неизменной строкой после каждого отказа.
3. NotificationIntent: valid/invalid statuses и lease shape, dedupe по обоим ключам, claim token, persisted expired-lease reclaim и redrive-compatible state того же intent.
4. ConfigurationChange: insert с required organization/actor/command references, invalid FK rejection, запрет `UPDATE`/`DELETE` с сохранением audit row.
5. Новые `CaseEvent` FK: отсутствие command и несуществующий attachment отвергаются; допустимый event/attachment link проходит без правки TG-006 migration.

## 11. Git / integration handoff

Контракт: `codex/tg-007-contract-artem-r2` от `CONTRACT_BASE_SHA`; commit и push только этого файла с существующей human Git identity, затем сравнение local/remote SHA и clean clone. Передать полный contract SHA на **один** independent review в отдельном чистом чате. Review не создаёт committed artifact. После closed TG-006 и review будущая implementation получает отдельную ветку/актуальную базу; её SHA и результаты проверок передаются Integration Agent, который единственный интегрирует в стабильный `main`.

## 12. Blocker protocol

При `SPEC CONFLICT`, выходе за write scope, несовместимости canonical contracts или неверном implementation `BASE_SHA` остановить затронутую работу и сообщить точный blocker ответственному. Implementation TG-007 запрещена до final closed TG-006 contract SHA и final TG-006 implementation SHA. Для CRITICAL `FIX_REQUIRED`: один полный batch findings, одно пакетное исправление, затем только targeted closure. Contract authoring не изменяет TG-006 regression и не открывает implementation gate.
