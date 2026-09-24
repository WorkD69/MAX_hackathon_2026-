# TG-003 TASK CONTRACT — FINAL TARGETED RECHECK

## 1. Result

```text
STATUS = TG003_FINAL_TARGETED_RECHECK_COMPLETE
TASK_ID = TG-003
BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99
VERDICT = PASS
TG003-R-005 = CLOSED
TG003-R-012 = CLOSED
PREVIOUSLY_CLOSED_FINDINGS_PRESERVED = YES
BLOCKER = 0
MAJOR = 0
MINOR = 0
LOCAL_REGRESSION_FINDINGS = NONE
IMPLEMENTATION_CHOICES_REMAINING = 0
SPEC_OR_ARCHITECTURE_GAPS = 0
CODING = BLOCKED
```

Это final targeted recheck только `TG003-R-005`, `TG003-R-012` и прямых локальных последствий последних fixes. Новый широкий review не выполнялся.

## 2. Baseline

- local `HEAD = 200b117bd58f7080c15fba1cfa556d386a085c99`;
- working tree clean;
- local `main` может отставать от current `origin/main`; это не baseline failure;
- immutable source authority TG-003 остаётся exact BASE_SHA;
- candidate, authoring report и repository этим recheck не изменялись.

`BASE_SHA_CHECK = PASS`.

## 3. TG003-R-005 Closure

**STATUS: CLOSED**

Проверено в candidate §§8, 10, 13, 15–17, 19–23:

- существует конечный closed registry из восьми runtime event methods и event codes;
- generic `log/info/error` или эквивалентный arbitrary-field API прямо запрещён и отсутствует из contract surface;
- каждый event имеет собственный exact flat primitive/literal payload type;
- каждый payload проверяется собственной strict runtime Zod schema до записи в Pino; unknown, missing, extra, nested и неверные literal combinations rejected;
- `RuntimeConfig`, `process.env`, request body, caller payload/context, arrays, `Error`/cause, unknown objects и caller-defined message strings не принимаются facade;
- raw Pino private для `logging/logger.ts`; единственное исключение — exact `loggerInstance` handoff в Fastify; TG-003 modules не используют `app.log`/`request.log`/`req.log`;
- sanitizer является defense-in-depth после закрытой schema boundary, а не primary trust boundary;
- `canonicalizeLogKey` задан буквально как `key.toLowerCase().replace(/[_\-.]/g, '')`;
- snake_case, camelCase, kebab-case и dotted aliases сводятся к одной canonical identity, включая `max_bot_token`, `maxBotToken`, `MAX-BOT-TOKEN`, `max.bot.token` → `maxbottoken`;
- compile-only fixture требует positive cases и `@ts-expect-error` для generic methods, extra/nested fields и прямых config/env/request/Error inputs;
- runtime tests проверяют strict rejection переменных объектов до log write;
- sanitizer/Pino tests проверяют alias matrix и фактический serialized JSON на отсутствие sentinel/message/stack/cause.

```text
LOGGING_FACADE_CLOSED = YES
ARBITRARY_STRUCTURED_LOG_FIELDS = FORBIDDEN
SECRET_KEY_NORMALIZATION_EXACT = YES
```

## 4. TG003-R-012 Closure

**STATUS: CLOSED**

Проверено в candidate §§8, 13, 15–17, 19–23:

- startup order фиксирован как PHASE 0 config → PHASE 1 logger → PHASE 2 factory → PHASE 3 listen → PHASE 4 running;
- PHASE 0 config failure: logger/app отсутствуют; zero close/timer/listeners; rejected value не inspect/print; один literal safe stderr record; `terminateOnce(1)` в `finally`; stable fake-test rejection;
- PHASE 1 logger failure: те же no-app/no-close/no-timer/no-listener guarantees; RuntimeConfig/error не serialize; отдельный literal safe stderr record; terminate exactly once;
- PHASE 2 factory failure: app не возвращён; no close/timer/listeners; только closed `runtimeStartupFailed` event; logging failure не отменяет termination; terminate exactly once;
- PHASE 3 listen failure является отдельной post-app ветвью: app exists, listeners ещё отсутствуют, используется общий bounded close controller с exact 10,000 ms timer;
- listen close success/rejection/timeout имеют разные stable results; timeout/rejection hard-exit exactly once; late close settlement ignored;
- PHASE 4 сохраняет approved SIGINT/SIGTERM/manual semantics, один shared shutdown promise, close success/rejection/timeout, timer/listener cleanup и idempotency;
- production `writeStderr`/`process.exit(1)` находятся только в `app/main.ts`; остальные modules не используют console, `process.stderr.write`, `process.exit` или `process.exitCode`;
- unit tests используют injected phase functions, signal/timer/stderr/hardExit adapter; real process exit и wall-clock sleep отсутствуют.

```text
PRE_APP_CONFIG_FAILURE_EXACT = YES
PRE_APP_LOGGER_FAILURE_EXACT = YES
PRE_APP_FACTORY_FAILURE_EXACT = YES
LISTEN_FAILURE_DISTINCT = YES
PROCESS_TERMINATION_EXACT = YES
```

## 5. Direct Adjacent Regression Check

`LOCAL_REGRESSION_FINDINGS = NONE`.

Сохранены проверяемые invariants:

| Invariant | Actual | Result |
|---|---:|---|
| `ALLOWED_WRITE_PATHS` | 4 | PASS |
| `SHARED_FILES` | 0 | PASS |
| `ROOT_LOCKFILE_TASK_OWNED` | NO | PASS |
| `ENV_KEY_COUNT` | 23 | PASS |
| dependency versions | Fastify 5.12.5; Pino 10.3.1; Zod 4.6.5; @fastify/static 10.1.4 | PASS |
| Fastify logger wiring | `loggerInstance` only | PASS |
| readiness JSON | unchanged exact contract | PASS |
| static namespace protection | unchanged exact predicate/tests | PASS |
| required `rg` | absent | PASS |
| native commands | fail-closed wrapper retained | PASS |

Ten findings previously marked CLOSED remain preserved. No direct contradiction or literal implementation blocker was introduced in the touched module-contract, logging, lifecycle, AC, tests, verification, negative-check, DoD or readiness sections.

## 6. Final Gate

```text
TG003-R-001 = CLOSED
TG003-R-002 = CLOSED
TG003-R-003 = CLOSED
TG003-R-004 = CLOSED
TG003-R-005 = CLOSED
TG003-R-006 = CLOSED
TG003-R-007 = CLOSED
TG003-R-008 = CLOSED
TG003-R-009 = CLOSED
TG003-R-010 = CLOSED
TG003-R-011 = CLOSED
TG003-R-012 = CLOSED
PREVIOUSLY_CLOSED_FINDINGS_PRESERVED = YES
IMPLEMENTATION_CHOICES_REMAINING = 0
SPEC_OR_ARCHITECTURE_GAPS = 0
VERDICT = PASS
NEXT_STEP = CANONICAL TG-003 TASK CONTRACT CLOSURE
```

PASS утверждает closure Task Contract findings. Coding остаётся `BLOCKED` до отдельного canonical approval/выдачи implementation task в соответствии с repository governance.
