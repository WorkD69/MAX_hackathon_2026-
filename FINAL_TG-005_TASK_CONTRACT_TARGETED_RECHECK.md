# TG-005 TASK CONTRACT — FINAL TARGETED CLOSURE RECHECK

> Роль: Senior TG-005 Final Targeted Closure Reviewer. Это НЕ полный new review — выполнен final targeted closure
> recheck ровно четырёх findings (TG005-R-B02, TG005-R-M05, TG005-TR-01, TG005-TR-02) и проверка сохранности
> previously closed findings (B01, M01, M02, M03, M04, N01). Repository **read-only**: ничего не модифицировано,
> commit/push не выполнялись. Проверка в canonical checkout
> `D:\max-hackathon-egor-tg005-contract-can` (HEAD = BASE_SHA, worktree чистый) и в off-repo модели
> `D:\Temp\opencode\tg005-tscheck2` (повторяет layout BASE_SHA; junction node_modules). Анализируемые артефакты —
> `TG-005_TASK_CONTRACT_CANDIDATE.md` (R3) и `TG-005_TASK_CONTRACT_AUTHORING_REPORT.md` (R3), вне target repository.
> Дата проверки: 2026-09-23.

## 0. Baseline verify

```text
git rev-parse HEAD            = 200b117bd58f7080c15fba1cfa556d386a085c99  (= BASE_SHA) OK
git status --short            = (empty)                                      OK
origin                        = https://github.com/WorkD69/MAX_hackathon_2026-.git  OK
```

Frozen-факты прочитаны из canonical checkout на BASE_SHA:

- `packages/db/tsconfig.json`: `module`/`moduleResolution` = `NodeNext`, `rootDir "src"`, `outDir "dist"`,
  `composite: true`, `declaration`/`declarationMap`/`sourceMap` true, `tsBuildInfoFile "dist/.tsbuildinfo"`,
  `types ["node"]`, **`include ["src/index.ts"]`**, `exclude ["dist","node_modules"]`.
- `packages/db/package.json`: `type module`, `files ["dist"]`, `types "./dist/index.d.ts"`,
  `exports { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } }`, три scripts
  (`build`/`typecheck`/`test` = `vitest run src/index.test.ts`). **Никакого `dist/src`-префикса.**
- `tsconfig.base.json`: strict, `noUncheckedIndexedAccess`, **`exactOptionalPropertyTypes`**,
  `verbatimModuleSyntax`, skipLibCheck=false, noEmitOnError, `types []` (без module/moduleResolution).

## 1. Findings Closure (targeted)

### TG005-R-B02 — frozen db config НЕ task-owned; supplementary configs; single-file boundary → **CLOSED**

Проверено по candidate R3:

- `packages/db/tsconfig.json` отсутствует в whitelist § 6 (не owned); § 6.2, § 10, § 17, § 20 согласованно
  закрепляют `FROZEN_WORKSPACE_CONFIG_OWNED_BY_TG005 = NO`; дифф-проверки § 16.10/§ 11 требуют отсутствия
  `packages/db/tsconfig.json` в diff.
- Вместо правки frozen-конфига — TG-005-owned `tsconfig.migrations.json` и `tsconfig.typecheck.json` (§ 10),
  оба **`extends "./tsconfig.json"`** (наследуют NodeNext + `types:["node"]`; `extends tsconfig.base.json` был бы
  TS2591 — подтверждено в Report § 2.8 Probe 3). Оба — в whitelist (#2, #3). Мои перечитывания 1:1 совпадают с § 10.
- `composite:true` + `include:["src/index.ts"]` ⇒ **single-file `src/index.ts`** (TS6307); тип-сюрфейс и runner
  объединены в `src/index.ts` (§ 8–9, layout-примечание § 6); отдельные `src/types.ts`/`src/migrator.ts` исключены.
- Supplementary configs НЕ меняют канонический layout: `tsconfig.migrations.json` эмитит только `dist/migrations/**`,
  `tsconfig.typecheck.json` — `noEmit` (таблица § 10, Probes 2–3 § 2.8).

Воспроизведение (модель `tg005-tscheck2`, TS 7.0.2 / ты же конфиги): frozen `npm run typecheck` exit 0, frozen build
exit 0, `tsc -p tsconfig.migrations.json` exit 0, `tsc -p tsconfig.typecheck.json` exit 0.

### TG005-TR-01 — flat `dist/` layout; runner/интеграция/verify без `dist/src`; compiled-mode на `dist/migrations` → **CLOSED**

- Итоговый layout § 10 — flat, без `dist/src`: `dist/index.js|d.ts(+map)`, `dist/.tsbuildinfo`,
  `dist/migrations/0001_foundation.js`; `packages/db/package.json` frozen-поля описаны как `./dist/index.d.ts`
  / `./dist/index.js` (correction R3, § 10), НЕ `./dist/src/…`.
- `dist/src`-вхождения в кандидате — только в негативных/защитных контекстах: negative guard
  `-not (Test-Path packages/db/dist/src)` (§ 16.4 шаг 4), `не включают dist/src/**` (§ 6), flat-описания (§ 10, § 19
  AC-013). Ни одного исполнительного `dist/src/…` checkpoint-а нет.
- § 13.2: интеграция импортирует **source** `./index.js` (vitest), не compiled `dist/…`; отдельная compiled-mode
  smoke на `./packages/db/dist/index.js` + `MIGRATIONS_DIR` + `FileMigrationProvider` из `dist/migrations/` (§ 16.4 шаг 4).

Воспроизведение (модель): после frozen build — `Test-Path packages/db/dist/src` = **False**;
`dist/index.js` = True, `dist/index.d.ts` = True, `dist/migrations/0001_foundation.js` = True,
`dist/.tsbuildinfo` = True. Compiled-mode node-проверка (команда verbatim из § 16.4): `MIGRATIONS_DIR` =
`<pkgRoot>/dist/migrations`, `FileMigrationProvider` загрузил `0001_foundation` → **PASS**.

### TG005-R-M02 — Kysely runner exact executable → **CLOSED** (preservation)

§ 9 фиксирует exact API 0.29.6: импорт из `kysely/migration` (`FileMigrationProvider`, `Migrator`,
`NO_MIGRATIONS`); отсутствие статического `Migrator.NO_MIGRATIONS`; `import` prop **обязателен**
(`(modulePath) => import(pathToFileURL(modulePath).href)`; raw-path `import()` невалиден на любой платформе);
`MigrationResultSet { error?, results? }` никогда не throw, `error` проверяется явно; **dual-anchor**
`resolveMigrationsDir` (source → `packages/db/migrations/`, compiled → `.../dist/migrations/`); ternary-возврат
`results === undefined ? {} : { results }` под `exactOptionalPropertyTypes` (TS2375). Реализация в модели 1:1
совпадает с pinned-блоком § 9. Source-mode (vitest) воспроизведён: `resolveMigrationsDir(src)` и загрузка `.ts`
миграции — 2/2 PASS. Compiled-mode загрузка — PASS (см. TR-01).

### TG005-R-M05 / TG005-TR-02 — оба NULL-negative readiness fixtures; exact-priority → **CLOSED**

§ 13.3 и AC-004 в R3 содержат ОБЕ независимые negative-фикстуры:

- (A) `LINKED_CONFIRMED` + `delivery_chat_id NULL` + валидный non-null `delivery_chat_type` → reject
  (23514, `ck_max_identity_readiness`);
- (B) `LINKED_CONFIRMED` + валидный non-null `delivery_chat_id` + `delivery_chat_type NULL` → reject
  (23514, `ck_max_identity_readiness`);
- оба NOT NULL → accept; `UNLINKED` с NULL-ами → accept;
- exact-priority: фикстуры строятся на строках, удовлетворяющих всем прочим ограничениям (валидные FK-родители,
  уникальные mini/bot/app id), чтобы единственно возможной ошибкой был 23514 на `ck_max_identity_readiness`
  (никакой предшествующий FK/PK failure). Catalog-exact assertions (§ 14) и единственная составно-ключа
  отрицательная фикстура `pk_organization_contractor` (M05) сохранены.

### Preservation (B01, M01, M03, M04, N01) — сохранены

| Finding | Статус | Проверено |
|---|---|---|
| B01 root lockfile не owned | CLOSED | § 6/6.1/12/15.9/16.2/16.8/16.10/17/20; install→`npm ci`→`git restore --source $BaseSha -- package-lock.json`; никогда не stage/commit; `SHARED_CONFIG_BATCH_OWNER = INTEGRATION_AGENT` |
| M01 partial unique | CLOSED | § 7: ровно 4 `CREATE UNIQUE INDEX ... WHERE ...` с именами и предикатами; catalog verification § 14 |
| M03 ColumnType/Generated | CLOSED | § 8: `config_revision` = `ColumnType<string, number\|string, number\|string>`, `is_synthetic` = `Generated<boolean>`; compile-time suite `types.typecheck.ts` + `tsconfig.typecheck.json` (exit 0 в модели) |
| M04 UserRoleBinding DDL | CLOSED | § 7: полный DDL (PK, FKs, 2 CHECK, active, created_at); negative fixtures — 23514 с именем |
| N01 full SHA only | CLOSED | В кандидате и отчёте R3 нет ни одного короткого SHA / Unicode-ellipsis в исполнимом контексте; только полный `200b117bd58f7080c15fba1cfa556d386a085c99` или `$BaseSha` (grep подтверждён) |

## 2. Field-by-field statuses (final closure)

```text
OUTPUT_LAYOUT_MATCHES_FROZEN_BASELINE: YES
FROZEN_WORKSPACE_CONFIG_OWNED_BY_TG005: NO
DIST_SRC_ASSUMPTION: NONE
SUPPLEMENTARY_TSCONFIG_SCOPE_VALID: YES
MIGRATION_PROVIDER_PATHS_EXECUTABLE: YES
COMPILED_MIGRATIONS_DIR_TESTED: YES
COMPILE_TIME_TYPE_TEST_EXECUTABLE: YES
READINESS_ID_NULL_NEGATIVE: YES
READINESS_TYPE_NULL_NEGATIVE: YES
IMPLEMENTATION_CHOICES_REMAINING: 0
SPEC_OR_ARCHITECTURE_GAPS: 0
```

## 3. Minimal mechanical evidence (reproduced this session)

```text
Model: D:\Temp\opencode\tg005-tscheck2 (layout-точная копия BASE_SHA; junction node_modules)
TS 7.0.2 / kysely 0.29.6 / pg 8.23.0 / @types/pg 8.23.1 / vitest 5.0.1

tsc -p packages/db/tsconfig.json --noEmit        → exit 0   (frozen typecheck)
tsc -p packages/db/tsconfig.json                 → exit 0   (frozen build)
tsc -p packages/db/tsconfig.migrations.json      → exit 0   (dist/migrations/0001_foundation.js)
tsc -p packages/db/tsconfig.typecheck.json       → exit 0   (compile-time type gate)
Test-Path packages/db/dist/src                   → False    (negative guard; no dist/src)
Test-Path packages/db/dist/index.js              → True
Test-Path packages/db/dist/index.d.ts            → True
Test-Path packages/db/dist/migrations/0001_foundation.js → True
Test-Path packages/db/dist/.tsbuildinfo          → True
node --input-type=module (command § 16.4 verbatim)  → COMPILED_MIGRATIONS_LOADED=YES
vitest run src/migrator.source-mode.test.ts      → 1 file, 2 tests PASS (resolveMigrationsDir law + .ts load)
```

## 4. Verdict

```text
STATUS: TG005_FINAL_TARGETED_RECHECK_COMPLETE
TASK_ID: TG-005

TG005-R-B01: CLOSED
TG005-R-B02: CLOSED
TG005-R-M01: CLOSED
TG005-R-M02: CLOSED
TG005-R-M03: CLOSED
TG005-R-M04: CLOSED
TG005-R-M05: CLOSED
TG005-R-N01: CLOSED
TG005-TR-01: CLOSED
TG005-TR-02: CLOSED

VERDICT: PASS

LOCAL_REGRESSION_FINDINGS: NONE

BLOCKER: 0
MAJOR: 0
MINOR: 0

FINDINGS_CLOSED: 10/10 (B01, B02, M01–M05, N01, TR-01, TR-02)
FINDINGS_OPEN: 0/10

IMPLEMENTATION_CHOICES_REMAINING: 0
SPEC_OR_ARCHITECTURE_GAPS: 0

CODING: BLOCKED
NEXT_STEP: CANONICAL TG-005 TASK CONTRACT CLOSURE
```

Примечание хранителя ворот: в силу механической природы ревью фикстуры БД (NULL-negative A/B, exact-priority)
и catalog-exact assertions окончательно исполняются только в coding phase против реального PostgreSQL
(`POSTGRES_PROVISIONING_BLOCKED`, если неприменимо); контракт это уже открыто декларирует (§ 14, § 16.7), scope
recheck не нарушен.