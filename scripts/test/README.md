# Integration-owned test infrastructure

## Контракт подготовки (CRITICAL)

База: `1cdb4aae413dcd25afb4564289b8e4bbe5aab41a`; ветка: `codex/integration-test-infra-prep`.
Источники: TG-026 на `44a59b0d234d6b962fc77189ad3c75379faf62fb`, TG-028 на базе, Task Graph, Task Template, BACKLOG.
Цель: root runners, exact Playwright dependency и безопасный test-only PostgreSQL seam. Это подготовка dependencies; implementations TG-026/028 не выполняются, main не интегрируется.
Разрешены root manifests/lockfile, runner configs, `scripts/test/**`, `tests/support/**`. Запрещены product files, migrations, app registry, auth bypass, feature scenarios, MAX network calls.

План: (1) проверить fail-closed runners и profile validation; (2) реализовать runners; (3) проверить guards, ownership и split roles на real PostgreSQL; (4) предоставить provisioning helper; (5) выполнить pinned clean install, root проверки, commit/push только compatibility branch.

Integration runner обнаруживает canonical `tests/integration/**/*.test.ts` и существующие workspace `*.integration.test.ts`, выполняет их последовательно по workspace, возвращает child failures. До появления обязательных TG-026 db/concurrency и TG-027 api suites итог non-zero с `MISSING_REQUIRED_SUITE`; existing suites не подменяют coverage. Пустой suite всегда non-zero.

Playwright launcher валидирует внешний профиль: `APPLICATION_BASE_URL`, optional `API_BASE_URL`, `TEST_AUTH_DEMO_PROFILE`, `SEED_SCENARIO_REF`. Внутренние поля — точные lower_snake_case из TG-028. TEST profile маркируется prefix `TEST:`; это только input marker, а не разрешение auth. Реальный допустимый профиль/seed/harness остаётся owning dependency. Mobile и desktop projects, без адресных defaults. Отсутствие E2E scenarios — non-zero.

Provisioning принимает explicit `APP_ENV=test`, `TEST_DATABASE_TARGET=DISPOSABLE_TEST_ONLY`, административный URL provisioner и создаёт только новое случайное имя `tg026_<run_id>_tg026_test`. Существующий target не принимается. Receipt содержит server identity, database OID/name, run ID, owner token, role names/OIDs. Server-side markers на DB/roles сверяются с receipt перед migrations/grants и перед cleanup. Collision не принимается за ownership. Административный principal не передаётся runtime.

Отдельные случайные migration и runtime login roles: runtime без SUPERUSER/CREATEDB/CREATEROLE/REPLICATION/BYPASSRLS, без membership, владения DB/schema/table и DDL. Canonical `migrateToLatest` применяется migration principal; runtime получает обычные DML/sequence privileges на application tables, без migration bookkeeping и marker. Production triggers/constraints не изменяются. Runtime URLs доступны только callback и receipt вне Git; secrets не логируются.

Cleanup success/failure — finally, signals — best effort. Interrupted recovery по сохранённому receipt требует повторной проверки server markers/identity; mismatch оставляет target. Проверка выполняется read-only до destructive actions; marker принадлежит provisioner, не runtime/migration. Raw owner token — случайный 256-bit capability только в приватном receipt; server comments содержат SHA-256 digest, поэтому каталог не позволяет восстановить пригодный receipt чужого запуска. Произвольный URL/receipt, production-like name и чужой token отвергаются до writes. Для legacy TG-005/006 регрессий provisioner может создать такой же disposable target с namespace `tg005`/`tg006`; это не TG-026 evidence.

Acceptance: meaningful infrastructure negative tests; real PG ownership/roles/cleanup success/failure/recovery; pinned `npm ci`, typecheck/build/existing tests; integration invocation и Playwright discovery с честным missing-suite failure; diff scope/whitespace check; human identity commit/push и remote SHA match. Отсутствующие modules/worker entry points, seed, auth, scenarios остаются unresolved. При spec conflict/out-of-scope — остановить затронутую работу.

## Использование

Exact toolchain: Node `24.21.0`, npm `11.19.0`, `.npmrc` с `engine-strict=true`.
Playwright `1.63.0`; версии `pg`/`kysely` совпадают с существующим DB workspace.

1. `npm ci`, `npm run typecheck`, `npm run build`.
2. `npm run test:infra` — независимые guards, input validation, discovery, empty-tree и child failure.
3. На выделенном test PostgreSQL cluster задать `TEST_POSTGRES_ADMIN_URL` административного login principal. Это bootstrap URL, **не** disposable target URL. Provisioner требует superuser для отдельной DB, server identity и role cleanup; никогда не использовать production principal/cluster. `APP_ENV=test` и `TEST_DATABASE_TARGET=DISPOSABLE_TEST_ONLY` — явная метка test-only provisioning. Runner не поднимает PostgreSQL автоматически, не отключает TLS и не задаёт host/port по умолчанию.
4. `npm run test:infra:postgres` — реальные DB tests; отсутствие PostgreSQL не даёт PASS. Tests задают явную test-only метку в options.
5. `npm run test:owned-db` выполняет workspace test scripts с `--no-file-parallelism` на восьми новых targets TG-005/006/007/008/012/013/013_SEAM/015_AUTH. TG-015 получает `TG015_TEST_DATABASE_URL` и отдельный receipt. DB suites очищают schema-level setup; serial files исключают взаимный teardown. TG-026 races внутри транзакций не сериализуются этим wrapper.
6. `npm run test:integration` выполняет существующие workspace suites и будущие canonical suites, включая TG-015 из `apps/api/tests`. Для owned targets: `npm run test:integration:owned-db`. При прямом запуске DB suites нужны соответствующие приватные `*_TEST_DATABASE_RECEIPT`; соединения сверяются с receipt/catalog до child process, произвольного URL недостаточно. Wrapper предоставляет эти inputs сам. До появления обязательных `tests/integration/db/**`, `concurrency/**`, `api/**` итог будет non-zero даже при PASS existing tests. `NO_INTEGRATION_TESTS`/`MISSING_REQUIRED_SUITE` — отсутствие runtime evidence, не green.

### PostgreSQL API для TG-026

Импортировать `withDisposablePostgres` из `tests/support/postgres.mjs` (есть TypeScript declaration).
Передать `{ adminUrl, env, receiptPath? }`. В callback доступны `migrationUrl`, `runtimeUrl`, приватный `receipt`, `receiptPath`, `preflight()` и `migrate()`. Последний вызывает только `migrateToLatest` из canonical `@max-smart-city/db`, затем выдаёт runtime обычные application DML/sequence grants. Migration bookkeeping исключён. Никаких новых application migrations/seed/registry здесь нет.

`preflight()` read-only проверяет server identity, DB/role OIDs, ownership proof, role flags/membership, реальные connection identities и отсутствие runtime CREATE/TEMP/schema CREATE/table ownership. Возвращает PostgreSQL version/isolation и principals для будущего CI fingerprint. Callback должен закрыть свои pools/processes перед выходом; cleanup force-disconnect затрагивает только доказанную собственную DB.

Receipt всегда атомарно сохраняется вне Git: в caller-provided private path либо новом OS temp directory. Хранить путь для recovery и не публиковать receipt/connection URLs в artifacts: raw token — capability на cleanup, login URLs содержат test passwords. На Windows приватность path обеспечивается пользовательскими ACL; `mode=0600` применим на POSIX. Recovery после SIGKILL/остановки host: при той же test-only метке и provisioner URL выполнить `node scripts/test/cleanup-postgres.mjs <private-receipt-path>`. Повторный cleanup идемпотентен. SIGINT/SIGTERM обрабатываются best effort, если ОС доставляет signal handler.

Несовпадение marker/OID/server/principal, неизвестный target или creation collision приводят к отказу. Если процесс оборван между CREATE и сохранением marker/OID, неподтверждённый resource **оставляется**, требуется проверка владельцем; cleanup не превращает недоказанный target в disposable. Восстановление использует только подтверждённые resource identities. Reset произвольной существующей DB не поддерживается.

### Playwright / TG-028

Задать `APPLICATION_BASE_URL`, optional `API_BASE_URL`, `TEST_AUTH_DEMO_PROFILE` и `SEED_SCENARIO_REF`; выполнить `npm run test:e2e` или `npm run test:e2e -- --list` для discovery. Config экспортирует два projects: `mobile` и `web-desktop`. Typed profile fields в `metadata.profile` совпадают с TG-028 lower_snake_case; config и будущие scenarios не нуждаются в правках адреса для TG-030.

Профиль пока является внешней ссылкой с явной меткой `TEST:<reference>`. Prefix — input safety marker, не auth implementation и не подтверждение существования разрешённого actor/seed. Owning TG-027/TG-029 harness должен разрешить конкретную ссылку и проверить её допустимость; launcher сейчас отвергает unmarked/production profile, credentials в URL, неверную URL scheme и отсутствующие inputs. Playwright browser binaries ставятся стандартным `npx playwright install chromium` только когда нужны browser runs; discovery/config validation их не требуют.

Сценарии ищутся в `tests/e2e/**/*.spec.{ts,js,mjs}`. Пока их нет, `No tests found`, exit non-zero. Screenshot/trace/video сохраняются при failure; будущие сценарии обязаны исключить секреты из artifacts. Shared config принадлежит Integration Agent; TG-028 владеет scenarios.

## Оставшиеся dependency requests

- TG-008: финальный deterministic seed manifest/business keys/CLI.
- TG-012: final transaction kernel/replay entry points и canonical errors.
- TG-016: завершённый owning implementation и финальный surface (контракт не заменяет implementation).
- TG-018: final config commands/audit/locking surface.
- TG-019: final worker claim/lease/finalize/redrive, hold-point и typed lease/retry settings.
- Existing module/worker child-process entry points для restart TG-026; здесь только infrastructure interruption fixture, product entry point/registry не создаётся.
- TG-027/TG-029: canonical TEST auth/MAX session harness, разрешённый profile/seed inspection path и composed API.
- TG-026/TG-027 integration scenarios и TG-028 browser scenarios. Runners не выдают подготовку infrastructure за выполнение этих suites или live MAX evidence.
