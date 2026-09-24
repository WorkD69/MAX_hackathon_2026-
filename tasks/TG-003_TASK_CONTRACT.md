# TG-003 TASK CONTRACT

## 1. Contract Identity

| Поле | Значение |
|---|---|
| `TASK_ID` | `TG-003` |
| `TITLE` | Backend runtime skeleton, diagnostics и observability |
| `ASSIGNEE` | `STAS` |
| `TYPE` | `BACKEND` |
| `EXECUTION_CLASS` | `A — Implementation` |
| `PRIMARY_OWNERSHIP` | `LANE-A` |
| `BASE_SHA` | `200b117bd58f7080c15fba1cfa556d386a085c99` |
| `BRANCH` | `codex/tg-003-backend-runtime-foundation` |
| `TASK_CONTRACT_STATUS` | `APPROVED` |
| `TASK_CONTRACT_GATE` | `PASS` |
| `CODING_GATE` | `UNBLOCKED AFTER REPOSITORY CLOSURE` |

Immutable `BASE_SHA` — единственный source authority TG-003. Движение `origin/main` после Wave-1 contract work не меняет эту базу и не является ошибкой.

## 2. Canonical Sources

Приоритет: официальные требования → официальные уточнения → `docs/01_PRODUCT_FREEZE.md` → `docs/02_PRODUCT_SPEC.md` → утверждённые technical documents → `tasks/TASK_GRAPH.md` → этот контракт → код.

Обязательный контекст:

- `AGENTS.md`;
- `docs/00_PROJECT_BRIEF.md`;
- `docs/01_PRODUCT_FREEZE.md`;
- `docs/02_PRODUCT_SPEC.md`;
- `docs/03_ARCHITECTURE.md`, §§6.2, 7, 10, 18, 20, 24–25;
- `docs/04_DATA_MODEL.md`, §§6.5, 19, 25, 35;
- `docs/05_INTERFACE_CONTRACTS.md`, §§1.1, 1.4, 2–3, 25, 27–28, 31, 37A;
- `docs/07_DECISIONS.md`, ADR-008, ADR-009, ADR-016, ADR-017, ADR-018, ADR-023;
- `docs/08_PROJECT_STATE.md`, `docs/09_HACKATHON_CRITERIA.md`, `docs/ORCHESTRATOR_HANDOFF.md`;
- `tasks/TASK_GRAPH.md`, exact TG-003 definition и §§2, 5, 7, 9, 12–15;
- `tasks/TASK_TEMPLATE.md`, `tasks/BACKLOG.md`, `tasks/TG-001_TASK_CONTRACT.md` §12B.

При конфликте с Product Freeze/Product Spec: `SPEC CONFLICT`, STOP, без workaround.

## 3. Exact Goal

Создать в четырёх canonical TG-003 source trees минимальный Fastify runtime foundation одного deployable modular-monolith backend-процесса: side-effect-free Fastify factory, единственную typed/configured границу `process.env`, безопасный Pino logger, diagnostic endpoints, readiness seam, namespace-safe static-build seam и детерминированный bounded process lifecycle.

Не реализовывать product workflow, DB foundation, MAX transport/auth/session, outbox worker, feature routes, React UI или delivery artifacts.

## 4. Exact-BASE Bootstrap and Preconditions

Все native commands вызываются только через fail-closed wrapper:

```powershell
$ErrorActionPreference = 'Stop'
function Invoke-NativeChecked {
  param(
    [Parameter(Mandatory)][string]$File,
    [Parameter()][string[]]$Arguments = @()
  )
  $output = & $File @Arguments
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    throw "NATIVE_COMMAND_FAILED[$code]: $File $($Arguments -join ' ')"
  }
  return $output
}

$expectedSha = '200b117bd58f7080c15fba1cfa556d386a085c99'
$branch = 'codex/tg-003-backend-runtime-foundation'
$commitish = $expectedSha + '^{commit}'

$repoRoot = (Invoke-NativeChecked git @('rev-parse','--show-toplevel') | Select-Object -Last 1).Trim()
Set-Location -LiteralPath $repoRoot
$status = @(Invoke-NativeChecked git @('status','--porcelain=v1'))
if ($status.Count -ne 0) { throw 'DIRTY_WORKTREE' }
Invoke-NativeChecked git @('cat-file','-e',$commitish) | Out-Null
$existingBranch = @(Invoke-NativeChecked git @('branch','--list',$branch))
if ($existingBranch.Count -ne 0) { throw 'BRANCH_ALREADY_EXISTS' }
if ((Invoke-NativeChecked node @('--version') | Select-Object -Last 1).Trim() -ne 'v24.21.0') { throw 'NODE_VERSION_MISMATCH' }
if ((Invoke-NativeChecked npm @('--version') | Select-Object -Last 1).Trim() -ne '11.19.0') { throw 'NPM_VERSION_MISMATCH' }

Invoke-NativeChecked git @('switch','-c',$branch,$expectedSha) | Out-Null
if ((Invoke-NativeChecked git @('rev-parse','HEAD') | Select-Object -Last 1).Trim() -ne $expectedSha) { throw 'BASE_SHA_BOOTSTRAP_FAILED' }
```

`origin/main == BASE_SHA` не требуется и не проверяется. Existing branch не переиспользуется неявно: execution останавливается для отдельной проверки его provenance.

## 5. Dependencies and Canonical Materialization Governance

### 5.1. Task dependencies

- `Depends On`: TG-001 — COMPLETE, IC-0 PASS.
- `Unlocks`: TG-010.
- `Parallel With`: TG-002, TG-004, TG-005.
- TG-002 владеет product HTTP/Zod schemas; TG-003 использует Zod только для runtime config.
- TG-005 владеет DB/migrations; TG-003 предоставляет только readiness interface.
- TG-029 владеет final API composition changes.
- TG-030 владеет `.env.example` и config-parity delivery check.

### 5.2. Exact dependency request — REQUIRED NOW

TG-003 выбирает и фиксирует запрос, но feature agent не меняет manifests/lockfile:

| Package | Exact version | Purpose |
|---|---:|---|
| `fastify` | `5.12.5` | runtime factory/lifecycle/injection |
| `pino` | `10.3.1` | explicit singleton structured logger |
| `zod` | `4.6.5` | central env validation |
| `@fastify/static` | `10.1.4` | static-build seam |

Версии stable, без ranges/prerelease. Fastify 5.12.5 допускает Pino `^9.14.0 || ^10.1.0`; `@fastify/static >=8.x` совместим с Fastify `^5.x`.

### 5.3. Non-committing feature verification setup

После clean baseline install feature agent устанавливает exact packages только в ignored `node_modules`, без изменения manifests/lockfile:

```powershell
Invoke-NativeChecked npm @('ci') | Out-Host
Invoke-NativeChecked npm @(
  'install','--no-save','--package-lock=false',
  'fastify@5.12.5','pino@10.3.1','zod@4.6.5','@fastify/static@10.1.4'
) | Out-Host

$postSetup = @(Invoke-NativeChecked git @('status','--porcelain=v1'))
if ($postSetup.Count -ne 0) { throw 'NON_COMMITTING_DEPENDENCY_SETUP_CHANGED_REPOSITORY' }
```

### 5.4. Integration Agent materialization request

Только Integration Agent на combined Wave-1 integration checkout:

1. добавляет четыре exact dependencies в `apps/api/package.json`, сохраняя internal `0.0.0` dependencies;
2. задаёт `test = "vitest run"`, `start = "node dist/app/main.js"`; build/typecheck остаются local `tsc`;
3. меняет `apps/api/tsconfig.json` include ровно на `["src/**/*.ts"]`, сохраняя остальные options;
4. npm 11.19.0 регенерирует единственный root `package-lock.json` v3 вместе со всеми approved Wave-1 dependency requests;
5. выполняет `npm ci`, `npm ls --all`, root/API build/typecheck/test;
6. единолично commit'ит combined manifest/config/lockfile materialization.

Feature branch не включает эти файлы. `ROOT_LOCKFILE_TASK_OWNED = NO`.

### 5.5. Deferred/forbidden dependencies

Не запрашивать `dotenv`, `pino-pretty`, `pg`, `kysely`, JWT/session/MAX SDK/HTTP client, queues/Redis, OpenAPI, React, testcontainers или другой test runner.

## 6. Allowed Write Scope and Parallel Safety

`ALLOWED_WRITE_PATHS = 4`, исчерпывающе:

1. `apps/api/src/app/**`;
2. `apps/api/src/config/**`;
3. `apps/api/src/logging/**`;
4. `apps/api/src/modules/health/**`.

`FILES_EXCLUSIVELY_OWNED` — ровно эти четыре trees.

`SHARED_FILES_IF_ANY = NONE`; `SHARED_FILES = 0`.

`package.json`, `package-lock.json`, TS/workspace configs и `apps/api/src/index*` не принадлежат feature agent. Collision risk feature branch = NONE. Combined dependency/config materialization risk = HIGH и полностью сериализуется Integration Agent по §5.4; manual lockfile merge, `ours/theirs`, второй lockfile запрещены.

## 7. Forbidden Write Scope

Запрещены любые другие paths, включая:

- все manifests, lockfiles, TS/workspace configs, `apps/api/src/index.ts`, `apps/api/src/index.test.ts`;
- `packages/contracts/**`, `packages/domain/**`, `packages/db/**`, `apps/web/**`;
- другие `apps/api/src/*` modules;
- migrations, seed, Docker/compose, `.env*`, OpenAPI, DATA-API, README, docs/tasks/spec/freeze/decisions;
- product routes/commands/state machine, DB client/schema, auth/session, MAX webhook/network, outbox worker, React или demo workflow.

## 8. Required Module Contract

Exact modules внутри allowed trees:

- `config/schema.ts` — `ENV_KEYS` tuple из 23 literal keys, Zod input schema, cross-field validation;
- `config/types.ts` — normalized deep-readonly `RuntimeConfig`;
- `config/load-config.ts` — единственное место чтения `process.env`; optional `NodeJS.ProcessEnv` injection; sanitized issues only;
- `logging/sanitize.ts` — recursive defense-in-depth sanitizer с exact canonical key normalization;
- `logging/logger.ts` — единственный `createRuntimeLogger(config, destination?)`, closed event registry, strict event-specific payload validators и facade без generic log API;
- `logging/logger.typecheck.ts` — compile-only positive/negative facade contract с обязательными `@ts-expect-error` cases;
- `modules/health/readiness.ts` — readiness interface/snapshot;
- `modules/health/plugin.ts` — exact diagnostics;
- `app/static.ts` — optional static registration with exact namespace deny predicate;
- `app/app.ts` — side-effect-free `buildApp({config, logger, readiness, staticAssets?})`;
- `app/lifecycle.ts` — injected stderr/process/timer/signal adapter, phased startup orchestrator и bounded start/stop;
- `app/main.ts` — executable process boundary с exact PHASE 0–4 algorithm; production stderr/hard-exit adapter only here;
- colocated `*.test.ts` files under the same four trees.

No placeholder future modules, no circular imports.

## 9. Runtime Configuration Contract

### 9.1. Canonical 23-key inventory

`ENV_KEYS.length` must equal 23 at compile/runtime test. Unknown env keys are ignored and never logged.

| # | Key | Required/default | Parser/normalized constraint | Secret |
|---:|---|---|---|---|
| 1 | `APP_ENV` | required | enum `development|test|production` | no |
| 2 | `HOST` | `0.0.0.0` | non-empty string, max 255 | no |
| 3 | `PORT` | `3000` | strict decimal integer `1..65535` | no |
| 4 | `DEMO_MODE` | required | literal `true|false` → boolean | no |
| 5 | `DATABASE_URL` | required | absolute `postgres:` or `postgresql:` URL | yes |
| 6 | `APP_SESSION_SECRET` | required | 32..4096 UTF-8 bytes | yes |
| 7 | `MAX_ADAPTER_MODE` | required | enum `live|fake` | no |
| 8 | `MAX_BOT_TOKEN` | live required; fake-test absent | 8..4096 chars | yes |
| 9 | `MAX_WEBHOOK_SECRET` | live required; fake-test absent | 32..4096 UTF-8 bytes | yes |
| 10 | `PUBLIC_APP_URL` | required | absolute URL, no credentials/hash | no |
| 11 | `PUBLIC_API_BASE_URL` | required | absolute URL, no credentials/hash/query; pathname ends `/api/v1` | no |
| 12 | `BUILD_SHA` | required | `^[0-9a-f]{40}$` | no |
| 13 | `MAX_INIT_DATA_MAX_AGE_SECONDS` | `300` | integer `60..3600` | no |
| 14 | `MAX_INIT_DATA_FUTURE_SKEW_SECONDS` | `30` | integer `0..300`, less than max age | no |
| 15 | `APP_SESSION_TTL_SECONDS` | `900` | integer `60..3600` | no |
| 16 | `MAX_REQUEST_TIMEOUT_MS` | `10000` | integer `1000..30000` | no |
| 17 | `MAX_SUBSCRIPTION_RECONCILE_INTERVAL_MS` | `300000` | integer `30000..3600000` | no |
| 18 | `NOTIFICATION_WORKER_POLL_INTERVAL_MS` | `1000` | integer `100..60000` | no |
| 19 | `NOTIFICATION_WORKER_CONCURRENCY` | `4` | integer `1..32` | no |
| 20 | `NOTIFICATION_RETRY_BASE_MS` | `1000` | integer `100..60000` | no |
| 21 | `NOTIFICATION_RETRY_MAX_MS` | `300000` | integer `1000..3600000`, >= base | no |
| 22 | `NOTIFICATION_LEASE_MS` | `30000` | integer `5000..300000`, > MAX timeout | no |
| 23 | `NOTIFICATION_MAX_ATTEMPTS` | `8` | integer `1..20` | no |

Integers accept only ASCII decimal digits without sign, fraction or whitespace. Booleans accept only lowercase literals.

### 9.2. Exact mode rules

- live mode always requires both MAX secrets;
- fake mode only when `APP_ENV=test`; MAX secrets are forbidden in fake mode;
- production requires live mode, HTTPS public URLs and non-loopback public hosts;
- development/test accept syntactically valid `http:` or `https:` absolute URLs on loopback, Docker service, LAN or remote hosts; loopback-only restriction отсутствует;
- production + DEMO_MODE=true is valid for approved demo and emits one `critical` safe event without values;
- invalid config throws before factory/listen; issue output includes key/reason, never rejected value;
- `.env` loading absent; `.env.example` belongs to TG-030.

## 10. Exact Logging and Nested Secret Redaction

### 10.1. One logger wiring

`app/main.ts` calls `createRuntimeLogger` exactly once. It returns one frozen pair `{ loggerInstance: pino.Logger, events: RuntimeEventLogger }`. `buildApp` accepts exactly that `loggerInstance` plus the closed `events` facade and invokes Fastify 5 exactly as:

```ts
fastify({ loggerInstance: logger })
```

`logger` options and a second logger are not accepted by `buildApp`; Fastify/Pino logger is never created twice. Only `loggerInstance` reaches Fastify. Runtime modules receive `RuntimeEventLogger`, not a raw arbitrary-field Pino API. Base bindings are exactly `service: 'api'`, `app_env`, `build_sha`. Pretty transport is absent.

### 10.2. Defense-in-depth redaction

Layer 1 — Pino redact paths, replacement `[REDACTED]`:

```text
req.headers.authorization
req.headers.cookie
req.headers.x-max-bot-api-secret
req.body.init_data
req.body.initData
```

Layer 2 — `canonicalizeLogKey(key)` is exactly `key.toLowerCase().replace(/[_\-.]/g, '')`. `sanitizeForLog(value)` recursively copies only plain objects/arrays and replaces a value at any nesting depth when its canonical key belongs to this exact set:

```text
authorization
cookie
xmaxbotapisecret
initdata
sessiontoken
token
maxbottoken
maxwebhooksecret
appsessionsecret
databaseurl
password
filebytes
bytes
```

Therefore snake_case, camelCase, kebab-case and dotted variants normalize identically: for example `max_bot_token`, `maxBotToken`, `MAX-BOT-TOKEN` and `max.bot.token` all become `maxbottoken`. Exact recursion rules: maximum depth 8; maximum 100 keys/items per container; cycles become `[CIRCULAR]`; truncated branches become `[TRUNCATED]`; matching keys become `[REDACTED]`; symbol/function values are omitted. Input is never mutated.

### 10.3. Closed runtime event facade

Generic methods such as `log(eventCode, object)`, `info(object)`, `error(object)` or any equivalent arbitrary structured-field API are absent from `RuntimeEventLogger`. The facade exposes exactly these event-specific methods and no others:

| Facade method | Emitted event code | Exact payload |
|---|---|---|
| `productionDemoModeEnabled()` | `production_demo_mode_enabled` | no payload |
| `runtimeListening(value)` | `runtime_listening` | `{ host: string; port: number }` |
| `readinessProbeFailed(value)` | `readiness_probe_failed` | `{ errorType: 'runtime_error'\|'non_error'; errorCode: 'READINESS_PROBE_FAILED' }` |
| `runtimeStartupFailed(value)` | `runtime_startup_failed` | `{ phase: 'factory'; errorType: 'runtime_error'\|'non_error'; errorCode: 'FACTORY_BUILD_FAILED' }` **or** `{ phase: 'listen'; errorType: 'runtime_error'\|'non_error'; errorCode: 'LISTEN_FAILED' }` |
| `gracefulShutdownStarted(value)` | `graceful_shutdown_started` | `{ trigger: 'SIGINT'\|'SIGTERM'\|'manual'\|'startup_failure' }` |
| `gracefulShutdownCompleted(value)` | `graceful_shutdown_completed` | `{ trigger: 'SIGINT'\|'SIGTERM'\|'manual'\|'startup_failure' }` |
| `gracefulShutdownFailed(value)` | `graceful_shutdown_failed` | `{ trigger: 'SIGINT'\|'SIGTERM'\|'manual'\|'startup_failure'; errorType: 'runtime_error'\|'non_error'; errorCode: 'SHUTDOWN_CLOSE_FAILED' }` |
| `gracefulShutdownTimedOut(value)` | `graceful_shutdown_timeout` | `{ trigger: 'SIGINT'\|'SIGTERM'\|'manual'\|'startup_failure'; timeoutMs: 10000 }` |

Every payload is flat and contains only the listed primitive/literal fields. Each method has its own TypeScript payload type and its own strict runtime Zod schema; unknown/missing/extra fields and wrong literal combinations are rejected before Pino. `runtimeStartupFailed` additionally enforces the exact phase↔errorCode pair. The facade applies `sanitizeForLog` after strict validation and before calling the private Pino instance.

`serializeRuntimeError(error, errorCode)` is internal and returns exactly `{ errorType, errorCode }`: `errorType` is `runtime_error` only for `error instanceof Error`, otherwise `non_error`; `errorCode` is the closed call-site literal. It never reads or returns name, message, stack, cause or enumerable Error fields.

`RuntimeConfig`, `process.env`, request body, caller payload/context, `Error`/cause, arrays, unknown objects and caller-defined message strings cannot be passed to any facade method. Underlying raw Pino methods are private to `logging/logger.ts` except the one `loggerInstance` handed directly to Fastify. TG-003 modules must not invoke Fastify `app.log`/`request.log`/`req.log`; automatic Fastify request logging is the only use outside the facade. A later owner may add a new event only by extending this closed registry, payload type, strict schema and tests together.

### 10.4. Logging contract tests

`logging/logger.typecheck.ts` proves allowed calls compile and uses `@ts-expect-error` for: nonexistent generic `log/info/error`; extra fields; nested object/array; direct `RuntimeConfig`; `NodeJS.ProcessEnv`; request body; Error/cause. Runtime tests pass variables with extra/unknown fields and require strict rejection before write.

Sanitizer tests cover unique sentinels under snake_case, camelCase, kebab-case and dotted aliases for every canonical sensitive key, at root and nested in objects/arrays. Actual serialized Pino JSON tests prove no sentinel, Error message, stack or cause occurs. Unknown key `credential` is not treated as safe: it is impossible through the closed facade and a runtime attempt is rejected rather than logged.

## 11. Exact Diagnostics and Health JSON

All responses are `application/json; charset=utf-8`.

### `GET /health/live`

Status `200`, exact JSON:

```json
{"status":"ok"}
```

No DB/MAX check.

### `GET /health/ready`

Readiness snapshot fields: `databaseReachable`, `migrationsCurrent`, `applicationInitialized`.

All true → status `200`, exact JSON:

```json
{
  "status": "ready",
  "checks": {
    "database": "up",
    "migrations": "current",
    "application": "initialized"
  }
}
```

All false/default → status `503`, exact JSON:

```json
{
  "status": "not_ready",
  "checks": {
    "database": "down",
    "migrations": "pending",
    "application": "pending"
  }
}
```

For a non-throwing partial snapshot, each check maps independently by the same literal pairs; status is `not_ready` unless all three are success values.

Probe exception → status `503` and exactly the same all-false JSON shown above. Safe log contains event code `readiness_probe_failed` plus `error_type/error_code`; response/log omit message/stack/cause.

Default implementation returns all false. MAX connectivity is never a readiness check.

### `GET /api/v1/system/info`

Status `200`, exact JSON `{"build_sha":"<normalized BUILD_SHA>"}` and no other property. Captured value is immutable for app lifetime.

With static disabled, exact registered application routes are only these three GET routes plus Fastify-generated HEAD companions where Fastify creates them; tests capture `onRoute` metadata and assert no product routes.

## 12. Namespace-Safe Static Serving

Optional descriptor is exactly `{ root: string; prefix: '/'; index: 'index.html' }`; root is absolute. If absent, plugin is not registered.

Registration uses `@fastify/static` with `wildcard: true` and exact `allowedPath(pathName)` predicate:

1. replace backslashes with `/`;
2. strip all leading `/`;
3. lowercase;
4. split on `/`, removing empty segments;
5. return `false` when first segment is `health` or `integrations`, or first two segments are `api`,`v1`;
6. otherwise return `true`.

Thus all depths of `/api/v1/**`, `/health/**`, `/integrations/**` are denied independent of registration order/current routes. Similar non-reserved names such as `/healthz/**`, `/api/v10/**`, `/integration/**` remain eligible.

Conflict-file tests create an OS temp static root containing sentinel files at:

- `api/v1/hidden.txt`;
- `health/unknown.html`;
- `integrations/private.txt`;
- allowed `assets/ok.txt`.

Requests to every reserved file and unknown reserved subpath must return non-static `404`/canonical route response and never sentinel bytes; allowed asset returns `200`. Temp tree is removed in test cleanup. No SPA fallback is added by TG-003.

## 13. Exactly Bounded Lifecycle

`app/lifecycle.ts` defines exact injectable adapter:

```ts
interface ProcessBoundaryAdapter {
  writeStderr(line: string): void;
  addSignalListener(signal: 'SIGINT' | 'SIGTERM', handler: () => void): void;
  removeSignalListener(signal: 'SIGINT' | 'SIGTERM', handler: () => void): void;
  setTimer(handler: () => void, milliseconds: 10000): unknown;
  clearTimer(handle: unknown): void;
  hardExit(code: 1): never | void;
}
```

Production adapter exists only in `app/main.ts`: `writeStderr` calls `process.stderr.write`, and `hardExit(1)` calls `process.exit(1)`. No other module calls `console.*`, `process.stderr.write`, `process.exit` or sets `process.exitCode`. Unit tests inject a fake adapter and never exit the real process.

One `TerminationController` owns an idempotent `terminateOnce(1)` guard. Every fatal branch below calls only this guard; a second call is a no-op. If fake `hardExit` returns, the startup/shutdown promise rejects with the stable code specified below.

### 13.1. Literal startup phases

`app/main.ts` executes only this order:

```text
PHASE 0 — load config
PHASE 1 — create logger pair
PHASE 2 — build Fastify app
PHASE 3 — listen
PHASE 4 — running / signal lifecycle
```

No phase begins until the previous phase returns successfully.

### 13.2. PHASE 0 — config failure before logger/app

If `loadConfig` throws:

- logger and app do not exist; `close()`, timers and signal APIs are never called;
- the rejected value/error is not inspected, serialized or printed;
- `writeStderr` is attempted exactly once with this literal line including final LF:

```text
{"level":"fatal","event":"runtime_startup_failed","phase":"config","error_code":"CONFIG_INVALID"}\n
```

- in `finally`, `terminateOnce(1)` executes exactly once even if stderr writing throws;
- if fake hardExit returns, startup rejects with stable code `CONFIG_STARTUP_FAILED`.

No logger, `console.error`, throw-only path or `process.exitCode` alternative is allowed.

### 13.3. PHASE 1 — logger construction failure before app

If config is valid but `createRuntimeLogger` throws:

- app does not exist; `close()`, timers and signal APIs are never called;
- RuntimeConfig and thrown value are not serialized or printed;
- `writeStderr` is attempted exactly once with this literal line including final LF:

```text
{"level":"fatal","event":"runtime_startup_failed","phase":"logger","error_code":"LOGGER_CONSTRUCTION_FAILED"}\n
```

- in `finally`, `terminateOnce(1)` executes exactly once even if stderr writing throws;
- if fake hardExit returns, startup rejects with stable code `LOGGER_STARTUP_FAILED`.

### 13.4. PHASE 2 — factory failure before app return

If `buildApp` throws before returning a Fastify instance:

- app is `NOT_CREATED`; `close()`, timers and signal APIs are never called;
- no stderr/console fallback is used because the logger pair exists;
- `events.runtimeStartupFailed` is attempted exactly once with `{ phase: 'factory', ...serializeRuntimeError(error, 'FACTORY_BUILD_FAILED') }`;
- logging failure is ignored only to preserve termination; raw error is never sent elsewhere;
- in `finally`, `terminateOnce(1)` executes exactly once;
- if fake hardExit returns, startup rejects with stable code `FACTORY_STARTUP_FAILED`.

### 13.5. PHASE 3 — listen failure after app exists

If `listen` rejects, app `EXISTS`, but signal listeners have not yet been installed:

1. attempt closed event `runtimeStartupFailed` with phase `listen` and code `LISTEN_FAILED`;
2. invoke the same bounded close controller as shutdown, trigger `startup_failure`;
3. race `app.close()` against exactly one 10,000 ms injected timer;
4. close success: clear timer, then `terminateOnce(1)`; fake returns → reject `LISTEN_STARTUP_FAILED`;
5. close rejection: clear timer, emit `gracefulShutdownFailed`, `terminateOnce(1)`; fake returns → reject `SHUTDOWN_CLOSE_FAILED`;
6. timeout: clear fired handle, emit `gracefulShutdownTimedOut`, `terminateOnce(1)` without awaiting close; fake returns → reject `SHUTDOWN_TIMEOUT`;
7. late close settlement is ignored; no second hardExit/log/cleanup occurs.

Thus only listen/post-app failure invokes `close()` or creates a shutdown timer.

### 13.6. PHASE 4 — running and ordinary shutdown

After successful listen, register exactly one handler for each `SIGINT` and `SIGTERM`. Listen once; duplicate start rejects without another listener.

First signal/manual stop creates one shared shutdown promise; later stop/signal calls return it. It emits `gracefulShutdownStarted`, races `app.close()` against exactly one 10,000 ms timer, then:

- close success: clear timer, remove both listeners, emit `gracefulShutdownCompleted`, resolve; no hardExit;
- close rejection: clear timer, remove listeners, emit `gracefulShutdownFailed`, terminate once; fake returns → reject `SHUTDOWN_CLOSE_FAILED`;
- timeout: clear fired handle, remove listeners, emit `gracefulShutdownTimedOut`, terminate once without awaiting close; fake returns → reject `SHUTDOWN_TIMEOUT`.

Every path clears its timer handle and applicable listeners. Late settlement after timeout has no effect. Logging/reporting failure never prevents cleanup or termination.

### 13.7. Deterministic lifecycle tests

Tests inject phase functions, fake signals, manually controlled timer, recording stderr and recording hardExit. They separately prove config fail, logger fail, factory fail, listen fail, normal close success/rejection/timeout, duplicate start/stop, SIGINT/SIGTERM, exactly 10,000 ms, no nonexistent-app close, no pre-app timer/listeners, one hardExit per fatal path, ignored late close, and cleanup. No real process exit or wall-clock sleep.

## 14. Integration-Owned Package/TS Delta

Feature agent makes no package/TS changes. The exact Integration Agent patch is fixed in §5.4:

- API deps = three existing internal deps + four §5.2 exact deps;
- `test = vitest run`;
- `start = node dist/app/main.js`;
- API `include = ["src/**/*.ts"]`;
- one combined root lockfile v3.

Until materialization, feature verification uses §5.3 and temporary typecheck config in §17. IC-1 cannot pass until Integration Agent materializes and runs full clean-install regression.

## 15. Acceptance Criteria

1. Feature diff contains only four canonical source trees; zero shared/root files.
2. Four exact dependency requests are documented; task owns no manifest/lockfile.
3. Integration Agent request is exact and combined-Wave safe.
4. `ENV_KEYS` is the single 23-key inventory; every parser/default/bound/cross-field/secret classification is tested.
5. Non-production accepts valid HTTP remote/service URLs; production requires HTTPS/live/non-loopback.
6. Sole `process.env` read is `config/load-config.ts`; config/logger/factory/listen failure phases follow exact §13 behavior and never disclose values.
7. One Pino instance is wired only through Fastify 5 `loggerInstance`.
8. Closed event-specific facade has no arbitrary structured-field API; strict schemas reject unknown fields, and canonical-key sanitizer/Pino serializers prevent every sentinel leak.
9. Three diagnostics match literal JSON/status/content-type contracts; probe exception shape is exact.
10. Static conflicting files cannot serve under any reserved namespace depth.
11. Factory creates no business/DB/MAX side effect and registers no product route.
12. Pre-app config/logger/factory failures never call close/timer/listener APIs and terminate once; listen failure is distinct and invokes the exact 10,000 ms bounded close controller.
13. No product routes/business logic/state machine/auth/session/MAX network/outbox/DB/React/demo workflow.
14. Feature verification and later Integration Agent clean-install/build/typecheck/test are green.
15. No secrets, `.env*`, generated artifacts or untracked repository files.

## 16. Required Tests

- 23-key inventory count/uniqueness and table-driven positive/default/min/max/malformed/cross-field/mode/secret-output matrix;
- development/test remote HTTP URL acceptance and production HTTP rejection;
- sole env boundary and config error sentinel non-disclosure;
- closed facade compile fixture: every allowed event/field accepted; generic methods, extra/nested fields, RuntimeConfig/process.env/request/Error inputs rejected;
- runtime strict-schema rejection of variable objects with unknown fields before any log write;
- canonical key alias matrix for snake/camel/kebab/dotted sensitive names, nested objects/arrays, actual Pino JSON sentinel absence and restricted error serializer;
- exact `loggerInstance` identity (Fastify uses the supplied singleton; no second Pino instance);
- app factory construction/close/no-listen;
- exact diagnostics JSON for ready, all-false, every partial combination and exception;
- exact route inventory with static disabled;
- temp conflict files for three reserved namespaces plus allowed asset/control names;
- separate config/logger/factory/listen startup failure tests with exact stderr/event/stable code, zero nonexistent-app close and exactly one termination;
- injected timer/signal/stderr/hard-exit lifecycle matrix from §13, including preserved ordinary close success/rejection/timeout branches;
- structural imports/dependencies/paths checks and reviewer semantic diff inspection.

Tests require no PostgreSQL, MAX network, real secrets, fixed ports or wall-clock sleeps.

## 17. Windows/PowerShell Verification — Fail Closed

### 17.1. Setup and feature test/typecheck

Use `Invoke-NativeChecked` exactly as defined in §4.

```powershell
$expectedSha = '200b117bd58f7080c15fba1cfa556d386a085c99'
$allowedRoots = @(
  'apps/api/src/app/',
  'apps/api/src/config/',
  'apps/api/src/logging/',
  'apps/api/src/modules/health/'
)

Invoke-NativeChecked npm @('ci') | Out-Host
Invoke-NativeChecked npm @(
  'install','--no-save','--package-lock=false',
  'fastify@5.12.5','pino@10.3.1','zod@4.6.5','@fastify/static@10.1.4'
) | Out-Host
if (@(Invoke-NativeChecked git @('status','--porcelain=v1')).Count -ne 0) { throw 'SETUP_DIRTY_TREE' }

Invoke-NativeChecked npm @('exec','--','vitest','run',
  'apps/api/src/app','apps/api/src/config','apps/api/src/logging','apps/api/src/modules/health') | Out-Host

$tempConfig = Join-Path ([IO.Path]::GetTempPath()) ('tg003-' + [guid]::NewGuid().ToString('N') + '.json')
try {
  $apiConfig = (Resolve-Path -LiteralPath 'apps/api/tsconfig.json').Path.Replace('\','/')
  $srcRoot = (Resolve-Path -LiteralPath 'apps/api/src').Path.Replace('\','/')
  @{
    extends = $apiConfig
    compilerOptions = @{ noEmit = $true; rootDir = $srcRoot }
    include = @(
      "$srcRoot/app/**/*.ts", "$srcRoot/config/**/*.ts",
      "$srcRoot/logging/**/*.ts", "$srcRoot/modules/health/**/*.ts"
    )
    exclude = @("$srcRoot/**/*.test.ts", "$srcRoot/**/*.spec.ts")
  } | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -LiteralPath $tempConfig
  $tsc = Join-Path $repoRoot 'node_modules/.bin/tsc.cmd'
  Invoke-NativeChecked $tsc @('-p',$tempConfig) | Out-Host
} finally {
  if (Test-Path -LiteralPath $tempConfig) { Remove-Item -Force -LiteralPath $tempConfig }
}
```

### 17.2. Exact diff/path/import/dependency/route structure

No external CLI is used.

```powershell
$changed = @(
  @(Invoke-NativeChecked git @('diff','--name-only',$expectedSha,'--')) +
  @(Invoke-NativeChecked git @('ls-files','--others','--exclude-standard'))
) | Where-Object { $_ } | Sort-Object -Unique

$badPaths = @($changed | Where-Object {
  $normalized = $_.Replace('\','/')
  -not ($allowedRoots | Where-Object { $normalized.StartsWith($_,[StringComparison]::Ordinal) })
})
if ($badPaths.Count -ne 0) { throw "WRITE_SCOPE_VIOLATION: $($badPaths -join ', ')" }

$sourceFiles = @(Get-ChildItem -LiteralPath 'apps/api/src' -Recurse -File -Include '*.ts' |
  Where-Object { $_.FullName -notmatch '[\\/](dist|node_modules)[\\/]' })
$envHits = @($sourceFiles | Select-String -Pattern 'process\.env')
$envFiles = @($envHits | ForEach-Object { [IO.Path]::GetRelativePath($repoRoot,$_.Path).Replace('\','/') } | Sort-Object -Unique)
if ($envFiles.Count -ne 1 -or $envFiles[0] -ne 'apps/api/src/config/load-config.ts') { throw 'PROCESS_ENV_BOUNDARY_VIOLATION' }

$featureFiles = @($sourceFiles | Where-Object {
  $relative = [IO.Path]::GetRelativePath($repoRoot,$_.FullName).Replace('\','/')
  $allowedRoots | Where-Object { $relative.StartsWith($_,[StringComparison]::Ordinal) }
})
$importPattern = 'from\s+[''"](@max-smart-city/(db|domain)|pg|kysely|react|@max|ioredis|redis)[''"]|import\s*\(\s*[''"](@max-smart-city/(db|domain)|pg|kysely|react|@max|ioredis|redis)[''"]'
$forbiddenImports = @($featureFiles | Select-String -Pattern $importPattern)
if ($forbiddenImports.Count -ne 0) { throw 'FORBIDDEN_IMPORT_FOUND' }

$implementationFiles = @($featureFiles | Where-Object {
  $_.Name -notmatch '\.(test|spec|typecheck)\.ts$'
})
$consoleHits = @($implementationFiles | Select-String -Pattern '\bconsole\.(log|info|warn|error|debug|trace)\s*\(')
if ($consoleHits.Count -ne 0) { throw 'CONSOLE_LOGGING_BYPASS_FOUND' }
$rawFastifyLogHits = @($implementationFiles | Where-Object { $_.Name -ne 'logger.ts' } |
  Select-String -Pattern '\b(app|request|req)\.log\.(info|warn|error|fatal|debug|trace)\s*\(')
if ($rawFastifyLogHits.Count -ne 0) { throw 'RAW_FASTIFY_LOGGING_BYPASS_FOUND' }
$exitCodeHits = @($implementationFiles | Select-String -Pattern 'process\.exitCode')
if ($exitCodeHits.Count -ne 0) { throw 'PROCESS_EXITCODE_FORBIDDEN' }
$processBoundaryHits = @($implementationFiles | Select-String -Pattern 'process\.(stderr\.write|exit\s*\()')
$badProcessBoundaryHits = @($processBoundaryHits | Where-Object {
  [IO.Path]::GetRelativePath($repoRoot,$_.Path).Replace('\','/') -ne 'apps/api/src/app/main.ts'
})
if ($badProcessBoundaryHits.Count -ne 0) { throw 'PROCESS_TERMINATION_BOUNDARY_VIOLATION' }

$forbiddenDirs = @('auth','authorization','cases','commands','read-models','configuration','attachments','demo','max-adapter','notifications','maintenance')
foreach ($dir in $forbiddenDirs) {
  if (Test-Path -LiteralPath (Join-Path 'apps/api/src' $dir)) { throw "FORBIDDEN_MODULE_PATH: $dir" }
}

$manifestBaseBlob = (Invoke-NativeChecked git @('rev-parse',($expectedSha + ':apps/api/package.json')) | Select-Object -Last 1).Trim()
$manifestWorkBlob = (Invoke-NativeChecked git @('hash-object','apps/api/package.json') | Select-Object -Last 1).Trim()
if ($manifestBaseBlob -ne $manifestWorkBlob) { throw 'FEATURE_AGENT_MANIFEST_CHANGE_FORBIDDEN' }
$lockBaseBlob = (Invoke-NativeChecked git @('rev-parse',($expectedSha + ':package-lock.json')) | Select-Object -Last 1).Trim()
$lockWorkBlob = (Invoke-NativeChecked git @('hash-object','package-lock.json') | Select-Object -Last 1).Trim()
if ($lockBaseBlob -ne $lockWorkBlob) { throw 'FEATURE_AGENT_LOCKFILE_CHANGE_FORBIDDEN' }

# Required tests assert runtime route inventory and static namespace behavior;
# reviewer must also inspect the semantic diff because keyword scanning is not evidence.
Invoke-NativeChecked git @('diff','--check',$expectedSha,'--') | Out-Host
Invoke-NativeChecked git @('diff','--stat',$expectedSha,'--') | Out-Host
Invoke-NativeChecked git @('diff','--name-status',$expectedSha,'--') | Out-Host
```

### 17.3. Literal staged gate

```powershell
$stageTargets = @(
  'apps/api/src/app',
  'apps/api/src/config',
  'apps/api/src/logging',
  'apps/api/src/modules/health'
)
$requiredFiles = @(
  'apps/api/src/app/app.ts',
  'apps/api/src/app/lifecycle.ts',
  'apps/api/src/app/main.ts',
  'apps/api/src/app/static.ts',
  'apps/api/src/config/load-config.ts',
  'apps/api/src/config/schema.ts',
  'apps/api/src/config/types.ts',
  'apps/api/src/logging/logger.ts',
  'apps/api/src/logging/logger.typecheck.ts',
  'apps/api/src/logging/sanitize.ts',
  'apps/api/src/modules/health/plugin.ts',
  'apps/api/src/modules/health/readiness.ts'
)
Invoke-NativeChecked git (@('add','--') + $stageTargets) | Out-Null

$staged = @(Invoke-NativeChecked git @('diff','--cached','--name-only',$expectedSha,'--')) |
  Where-Object { $_ } | Sort-Object -Unique
if ($staged.Count -eq 0) { throw 'EMPTY_STAGED_DIFF' }
$badStaged = @($staged | Where-Object {
  $normalized = $_.Replace('\','/')
  -not ($allowedRoots | Where-Object { $normalized.StartsWith($_,[StringComparison]::Ordinal) })
})
if ($badStaged.Count -ne 0) { throw "STAGED_SCOPE_VIOLATION: $($badStaged -join ', ')" }

foreach ($root in $allowedRoots) {
  if (-not ($staged | Where-Object { $_.Replace('\','/').StartsWith($root,[StringComparison]::Ordinal) })) {
    throw "REQUIRED_TREE_NOT_STAGED: $root"
  }
}
foreach ($requiredFile in $requiredFiles) {
  if ($requiredFile -notin $staged) { throw "REQUIRED_FILE_NOT_STAGED: $requiredFile" }
}

Invoke-NativeChecked git @('diff','--cached','--check') | Out-Host
Invoke-NativeChecked git @('diff','--exit-code','--') | Out-Null
$untracked = @(Invoke-NativeChecked git @('ls-files','--others','--exclude-standard'))
if ($untracked.Count -ne 0) { throw "UNTRACKED_FILES_REMAIN: $($untracked -join ', ')" }

$statusBeforeCommit = @(Invoke-NativeChecked git @('status','--porcelain=v1'))
$nonStaged = @($statusBeforeCommit | Where-Object { $_.Length -ge 2 -and $_[1] -ne ' ' })
if ($nonStaged.Count -ne 0) { throw "UNSTAGED_CHANGES_REMAIN: $($nonStaged -join ', ')" }
Invoke-NativeChecked git @('diff','--cached','--stat',$expectedSha,'--') | Out-Host
Invoke-NativeChecked git @('diff','--cached','--name-status',$expectedSha,'--') | Out-Host
```

### 17.4. Integration Agent clean gate after materialization

```powershell
Invoke-NativeChecked npm @('ci') | Out-Host
Invoke-NativeChecked npm @('ls','--all') | Out-Host
Invoke-NativeChecked npm @('run','typecheck','--workspace','@max-smart-city/api') | Out-Host
Invoke-NativeChecked npm @('run','build','--workspace','@max-smart-city/api') | Out-Host
Invoke-NativeChecked npm @('run','test','--workspace','@max-smart-city/api') | Out-Host
Invoke-NativeChecked npm @('run','typecheck') | Out-Host
Invoke-NativeChecked npm @('run','build') | Out-Host
Invoke-NativeChecked npm @('test') | Out-Host
```

Integration Agent additionally asserts exact API dependency set and lockfile v3 from §5.4. Feature agent never runs this as proof before shared materialization.

## 18. Git Safety and Commit/Push Protocol

- No permission changes, hard reset, clean, force checkout, rebase чужих branches или destructive cleanup.
- Dirty initial state, existing branch or missing BASE commit → STOP.
- Existing human Git identity only; no AI author/co-author/signature.
- Commit only after §§17.1–17.3 green and semantic diff review:

```powershell
Invoke-NativeChecked git @('commit','-m','feat(api): establish backend runtime foundation') | Out-Host
$commitSha = (Invoke-NativeChecked git @('rev-parse','HEAD') | Select-Object -Last 1).Trim()
Invoke-NativeChecked git @('push','origin','codex/tg-003-backend-runtime-foundation') | Out-Host
$finalStatus = @(Invoke-NativeChecked git @('status','--porcelain=v1'))
if ($finalStatus.Count -ne 0) { throw 'POST_COMMIT_WORKTREE_NOT_CLEAN' }
$commitSha
```

Feature commit contains only four source trees. No manifest/config/lockfile staging. No force push, no push main. После repository closure coding/commit/push разрешены строго по этому контракту.

## 19. Structural and Semantic Negative Checks

Mechanical proof uses paths, import specifiers, unchanged manifests/lockfile and runtime route inventory—not broad keywords. Protocol strings such as `postgresql:` and reserved route fixtures are allowed.

Reviewer must inspect complete diff semantically and confirm absence of:

- business state/role/command decisions;
- product routes or generic Case PATCH;
- DB queries/schema/migrations;
- auth crypto/session issuance;
- MAX network/webhook/outbox implementation;
- React/UI/demo workflow;
- Docker/delivery artifacts;
- config/logging bypasses, raw Pino use outside the private logger implementation/Fastify `loggerInstance` handoff, or a generic arbitrary-field runtime log API;
- startup code that closes a nonexistent app, installs pre-listen signals, creates a pre-app shutdown timer, uses console/exitCode, or terminates more than once.

## 20. Blocker Protocol

Immediate STOP without code/commit/push for:

- exact BASE commit missing or branch not created from it;
- dirty/read-only/wrong checkout, existing branch provenance unresolved;
- Node/npm mismatch;
- need to write outside four canonical trees;
- need for feature-owned manifest/lock/config change;
- non-committing dependency setup dirties repository;
- dependency unavailable/incompatible;
- secret appears in diff/test/log output;
- facade accepts an unregistered event, extra/nested caller field, RuntimeConfig/process.env/request/Error object, or a sensitive alias reaches serialized output;
- config/logger/factory failure touches close/timer/listener APIs, or any fatal path can skip/double hardExit;
- verification requires future-task implementation;
- canonical source conflict (`SPEC CONFLICT`) or missing semantics (`SPEC_OR_ARCHITECTURE_GAP`).

Report exact command, exit code, source section and sanitized evidence. No workaround.

## 21. Traceability

| Requirement | Source | Contract |
|---|---|---|
| Fastify modular backend/plugin shell | Architecture §§6.2, 9; TG-003 | §§3, 8 |
| Central typed env/config | TG-003; Architecture §§10, 25 | §9 |
| MAX/session/outbox operational values only | TG-003/TG-010/TG-019 | §9; consumers deferred |
| Structured logs/no secrets | Architecture §24.1 | §10 closed facade, canonical aliases and serialized sentinel tests |
| Health/build identity | Architecture §§24.2–24.3; Interface §§1.1, 1.4, 31 | §11 |
| Static build seam | Architecture §§20–21 | §12 |
| Graceful process lifecycle and startup failure | TG-003 required outputs | §13 literal PHASE 0–4, early fatal reporting and bounded close |
| Root shared-file governance | Task Graph §§2, 7; TG-001 §12B | §§5–6, 14 |
| No future scope | TG-002/TG-005/TG-010/TG-019/TG-029/TG-030 | §§7, 19 |

## 22. Definition of Done

TG-003 complete only when:

- contract separately approved before coding;
- branch created explicitly from immutable BASE_SHA;
- only four canonical trees changed;
- all 23 config keys, closed logging event registry/key normalization and every PHASE 0–4 startup/lifecycle branch implemented exactly;
- §§17.1–17.3 green and semantic diff reviewed;
- one human-authored feature commit pushed with full SHA/status;
- Integration Agent applies exact §5.4 combined materialization, owns root lockfile, and §17.4 is green;
- IC-1 establishes new stable main.

## 23. Closure Readiness

```text
BASE_SHA_VERIFIED = YES
BASE_SHA_BOOTSTRAP_EXACT = YES
TASK_GRAPH_SCOPE_MATCH = YES
ALLOWED_WRITE_SCOPE_EXACT = YES
ALLOWED_WRITE_PATHS = 4
SHARED_FILES = 0
ROOT_LOCKFILE_TASK_OWNED = NO
ENV_KEY_COUNT = 23
DEPENDENCIES_REQUIRED_NOW_EXACT = YES
DEPENDENCY_VERSIONS_VERIFIED = YES
NESTED_SECRET_REDACTION_EXACT = YES
LOGGING_FACADE_CLOSED = YES
ARBITRARY_STRUCTURED_LOG_FIELDS = FORBIDDEN
SECRET_KEY_NORMALIZATION_EXACT = YES
CAMELCASE_SECRET_SENTINEL_TEST = DEFINED
FASTIFY_LOGGER_WIRING_EXACT = YES
READY_JSON_SCHEMA_EXACT = YES
STATIC_NAMESPACE_ISOLATION_EXACT = YES
UNPINNED_EXTERNAL_CLI = 0
NATIVE_COMMAND_FAIL_CLOSED = YES
FALSE_POSITIVE_NEGATIVE_SCAN = NO
BOUNDED_SHUTDOWN_EXACT = YES
PRE_APP_CONFIG_FAILURE_EXACT = YES
PRE_APP_LOGGER_FAILURE_EXACT = YES
PRE_APP_FACTORY_FAILURE_EXACT = YES
LISTEN_FAILURE_DISTINCT = YES
EARLY_FAILURE_CLOSE_NONEXISTENT_APP = NO
PROCESS_TERMINATION_EXACT = YES
PARALLEL_COLLISION_MODEL_EXPLICIT = YES
PREVIOUSLY_CLOSED_FINDINGS_PRESERVED = YES
IMPLEMENTATION_CHOICES_REMAINING = 0
SPEC_OR_ARCHITECTURE_GAPS = 0
LOCAL_REGRESSION = NONE
CODING = UNBLOCKED
```
