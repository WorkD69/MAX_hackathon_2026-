# TG-001 TASK CONTRACT

## 1. Contract Identity

```text
TASK_ID = TG-001
BASE_SHA = 1b2206899322ac4416a578a1fa5f50b336d9cab5
TASK_GRAPH_GATE = PASS
TASK_CONTRACT_STATUS = APPROVED
TASK_CONTRACT_GATE = PASS
CODING = ALLOWED FOR TG-001 ONLY AFTER EXECUTION-ENVIRONMENT BOOTSTRAP
```

Контракт канонизирован в target repository. Он разрешает TG-001 implementation, commit и push только по зафиксированным ниже условиям после execution-environment bootstrap.

## 2. Canonical Sources

Нормативные источники прочитаны из immutable detached checkout exact `BASE_SHA`:

1. `AGENTS.md` — правила task contract, `base_sha`, file ownership, Git identity и commit/push.
2. `docs/00_PROJECT_BRIEF.md` — продуктовый контекст Bot + Mini App.
3. `docs/01_PRODUCT_FREEZE.md` — approved scope, запрет самостоятельного изменения продукта, pin версий.
4. `docs/02_PRODUCT_SPEC.md` — approved product semantics; TG-001 не реализует их.
5. `docs/03_ARCHITECTURE.md` §§ 4, 6, 21, 26, 28–31 — approved stack, modular monolith, delivery/test boundaries.
6. `docs/04_DATA_MODEL.md` — approved persistence model; SQL migrations ещё не создаются.
7. `docs/05_INTERFACE_CONTRACTS.md` — approved interfaces; HTTP/Zod schemas ещё не создаются.
8. `docs/07_DECISIONS.md`, особенно ADR-008, ADR-009, ADR-024, ADR-026.
9. `docs/08_PROJECT_STATE.md` — `CREATE / TASK CONTRACTS`, coding blocked.
10. `docs/09_HACKATHON_CRITERIA.md` §§ 3, 8 — reproducibility, dependencies, Docker as later delivery output.
11. `docs/ORCHESTRATOR_HANDOFF.md` — contracts before coding; stable SHA between waves.
12. `tasks/BACKLOG.md` и `tasks/TASK_TEMPLATE.md` — current gate и обязательные поля контракта.
13. `tasks/TASK_GRAPH.md` §§ 2–3, 5, 7, 9, 13 — TG-001, WAVE 0, file ownership, IC-0, stable-SHA rule.

Time-sensitive версии проверены 2026-09-22 по официальным Node.js release metadata и npm registry metadata. Используются только stable releases без prerelease identifiers.

## 3. TG-001 Source Definition

Canonical definition из `tasks/TASK_GRAPH.md`:

- тип: `FOUNDATION`;
- execution class: `A — Implementation`;
- dependency: `NONE`;
- unlocks: `TG-002`, `TG-003`, `TG-004`, `TG-005`;
- parallelism: `NONE`;
- owner: `LANE-A`;
- WAVE: `WAVE 0 — repository foundation lock`;
- checkpoint: `IC-0 Workspace`;
- result: один npm workspace, один root lockfile, clean build/typecheck/test skeleton, package boundaries без production logic;
- после checkpoint root manifests/configs замораживаются; TG-002–TG-005 получают новый stable full SHA.

TG-001 создаёт только foundation:

- npm workspaces;
- один root `package-lock.json`;
- общий TypeScript baseline;
- boundaries одного backend, одной Mini App и трёх shared packages;
- root/workspace build, typecheck и honest structural test smoke;
- явные no-suite-yet commands для integration и E2E.

TG-001 не реализует product behavior и не подменяет owner tasks TG-002–TG-005.

## 4. Goal

По утверждённому контракту coding-agent должен без самостоятельного архитектурного выбора создать воспроизводимую workspace foundation, на которой:

- npm обнаруживает ровно пять workspaces;
- TypeScript компилирует пять минимальных package boundaries;
- package names, module system, compiler target, output layout и imports однозначны;
- direct third-party dependencies TG-001 exact-pinned;
- root команды выполняются детерминированно и не изображают наличие business suites;
- будущие feature dependencies не установлены раньше owner task;
- implementation result может быть передан отдельному Integration Agent как `IC-0 READY`; только Integration Agent создаёт stable main checkpoint SHA.

## Execution Environment Bootstrap

До передачи Task Contract coding-agent Contract / Execution Orchestrator обязан предоставить checkout canonical repository на local branch `codex/tg-001-workspace-foundation`, созданной ровно от `1b2206899322ac4416a578a1fa5f50b336d9cab5`, с clean worktree. Remote task branch и configured upstream на этом этапе не требуются.

Orchestrator owns LOCAL branch bootstrap. Coding-agent не выбирает branch name, не создаёт implementation branch, не создаёт remote branch заранее и не конфигурирует upstream. Coding-agent только проверяет полученный execution environment существующим preflight в § 5 и § 18.1.

Если local branch отсутствует, Orchestrator выполняет exact command:

```powershell
git switch --create codex/tg-001-workspace-foundation 1b2206899322ac4416a578a1fa5f50b336d9cab5
```

Сразу после команды Orchestrator обязан выполнить:

```powershell
git branch --show-current
git rev-parse HEAD
git status --short
```

Expected result:

```text
branch = codex/tg-001-workspace-foundation
HEAD = 1b2206899322ac4416a578a1fa5f50b336d9cab5
worktree = clean
```

Если local branch уже существует, Orchestrator не пересоздаёт branch, не reset'ит её, не удаляет branch, не очищает worktree и не перезаписывает unknown work. Orchestrator может передать checkout coding-agent только если одновременно:

```text
branch = codex/tg-001-workspace-foundation
HEAD = 1b2206899322ac4416a578a1fa5f50b336d9cab5
worktree = clean
```

При любом несоответствии Orchestrator возвращает `TASK_BRANCH_BOOTSTRAP_BLOCKED`, и implementation не начинается. После implementation commit coding-agent по-прежнему выполняет `git push origin codex/tg-001-workspace-foundation` без `-u` согласно § 21; это первый момент, когда remote task branch может быть создана.

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

- `git rev-parse HEAD` равно `1b2206899322ac4416a578a1fa5f50b336d9cab5`;
- `git status --short` пуст;
- работа ведётся в checkout target repository, а `git rev-parse --show-toplevel` не равен `C:/`;
- branch ровно `codex/tg-001-workspace-foundation` и её текущий `HEAD` ровно `BASE_SHA`; detached HEAD, `main` и самостоятельно выбранная иная branch для implementation не допускаются;
- Node и npm до install строго равны baseline из § 9.

Любое несоответствие SHA или неизвестные local changes: вывести `BASELINE_MISMATCH` и остановиться. Не применять `reset --hard`, `clean -fd`, `restore .`, force push и не удалять неизвестные изменения.

## 6. Allowed Write Scope

Исчерпывающий whitelist author-created/tracked files содержит **25 paths**. Все пути repository-relative; ни один иной author-created или tracked path не разрешён. Автоматические disposable writes инструментов разрешены только в `node_modules/**`, пяти workspace-local `dist/**`, `coverage/**`, `*.tsbuildinfo`, `playwright-report/**`, `test-results/**`; они ignored, не stage'ятся и могут быть удалены/пересозданы только соответствующим package-manager/build/test command.

### Root — 5

1. `.gitignore`
2. `.npmrc`
3. `package.json`
4. `package-lock.json`
5. `tsconfig.base.json`

### `apps/api` — 4

6. `apps/api/package.json`
7. `apps/api/tsconfig.json`
8. `apps/api/src/index.ts`
9. `apps/api/src/index.test.ts`

### `apps/web` — 4

10. `apps/web/package.json`
11. `apps/web/tsconfig.json`
12. `apps/web/src/index.ts`
13. `apps/web/src/index.test.ts`

### `packages/contracts` — 4

14. `packages/contracts/package.json`
15. `packages/contracts/tsconfig.json`
16. `packages/contracts/src/index.ts`
17. `packages/contracts/src/index.test.ts`

### `packages/domain` — 4

18. `packages/domain/package.json`
19. `packages/domain/tsconfig.json`
20. `packages/domain/src/index.ts`
21. `packages/domain/src/index.test.ts`

### `packages/db` — 4

22. `packages/db/package.json`
23. `packages/db/tsconfig.json`
24. `packages/db/src/index.ts`
25. `packages/db/src/index.test.ts`

Нумерация подтверждает **25 concrete files**: 5 root + 20 workspace files. Формулировка `other files as needed` запрещена.

`node_modules/**`, `dist/**`, `coverage/**` и `*.tsbuildinfo` являются generated local artifacts, должны игнорироваться Git и не входят в deliverable/staging.

## 7. Forbidden Write Scope

Запрещены любые изменения вне § 6, включая:

- `AGENTS.md`, `README.md`;
- `docs/01_PRODUCT_FREEZE.md`;
- `docs/02_PRODUCT_SPEC.md`;
- `docs/03_ARCHITECTURE.md`;
- `docs/04_DATA_MODEL.md`;
- `docs/05_INTERFACE_CONTRACTS.md`;
- `docs/07_DECISIONS.md`;
- `docs/08_PROJECT_STATE.md`;
- `docs/09_HACKATHON_CRITERIA.md`;
- `docs/ORCHESTRATOR_HANDOFF.md`;
- `tasks/TASK_GRAPH.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`;
- любые `tests/integration/**`, `tests/e2e/**`, `docs/evidence/**`;
- любые files будущих feature tasks, кроме 20 boundary files, явно разрешённых § 6.

TG-001 не создаёт и не реализует:

- migrations, database schema, seed или PostgreSQL runtime;
- Case logic, state machine, roles или product invariants;
- HTTP/Zod product contracts;
- Fastify app, routes, config loader, health, logging или Pino setup;
- React components, product screens, router, QueryClient или Mini App shell;
- MAX auth, webhook, Bot adapter или notification worker;
- DemoRun logic;
- `Dockerfile`, compose files, `.dockerignore`, `.env.example`;
- `openapi.yaml`, `openapi.json`, `DATA-API.yaml`;
- Playwright config или business scenarios;
- runtime/deployment configuration, fixtures, public API implementation;
- ESLint, Prettier, pnpm, Yarn, Bun, Turborepo, Nx или альтернативный framework/package manager.

## 8. Required Repository Layout

После TG-001 repository должен иметь ровно следующую новую foundation layout:

```text
package.json
package-lock.json
tsconfig.base.json
.npmrc
.gitignore
apps/
  api/
    package.json
    tsconfig.json
    src/index.ts
    src/index.test.ts
  web/
    package.json
    tsconfig.json
    src/index.ts
    src/index.test.ts
packages/
  contracts/
    package.json
    tsconfig.json
    src/index.ts
    src/index.test.ts
  domain/
    package.json
    tsconfig.json
    src/index.ts
    src/index.test.ts
  db/
    package.json
    tsconfig.json
    src/index.ts
    src/index.test.ts
```

Root `workspaces` order фиксируется так: `packages/contracts`, `packages/domain`, `packages/db`, `apps/api`, `apps/web`. Globs `apps/*` и `packages/*` не используются: exact list предотвращает случайное включение будущей директории.

## 9. Node / npm Baseline

| Поле | Обязательное значение |
|---|---|
| Node platform | `24.21.0` |
| Node release line | LTS `Krypton`; не Current v26 |
| Root `engines.node` | `24.21.0` |
| npm | `11.19.0`, bundled with Node 24.21.0 |
| Root `engines.npm` | `11.19.0` |
| Root `packageManager` | `npm@11.19.0` |
| Workspaces | native npm workspaces |
| Lockfile | один root `package-lock.json`, `lockfileVersion = 3` |
| `.npmrc` | `engine-strict=true`, `package-lock=true`, `save-exact=true` |

Обоснование: на дату контракта Node 24.21.0 — latest LTS, тогда как Node 26 — Current. Node 24.21.0 совместим с TypeScript 7, Vitest 5, Vite 8, React Router 7, Kysely 0.29 и остальными pinned packages. Official sources: [Node.js releases](https://nodejs.org/en/about/previous-releases), [Node.js dist metadata](https://nodejs.org/dist/index.json), [npm 11.19.0](https://www.npmjs.com/package/npm/v/11.19.0).

Никакого выбора «Node 20/22/24» нет. Install при ином `node --version` или `npm --version` запрещён; agent возвращает `NODE_NPM_BASELINE_MISMATCH`.

## 10. Module / TypeScript Baseline

### Общая политика

- module system: **ESM only**;
- root и все пять workspace manifests: `"type": "module"`;
- CommonJS build/export запрещён;
- TypeScript: `7.0.2` exact;
- общий target: `ES2023`;
- strict baseline: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noImplicitOverride`, `forceConsistentCasingInFileNames`, `isolatedModules`, `verbatimModuleSyntax`, `moduleDetection = force`;
- `skipLibCheck = false`;
- source root каждого workspace: `src`;
- output каждого workspace: собственный `dist`;
- generated output не commit'ится.

`tsconfig.base.json` имеет ровно top-level key `compilerOptions`. В нём фиксируются: `target=ES2023`, `strict=true`, `noUncheckedIndexedAccess=true`, `exactOptionalPropertyTypes=true`, `useUnknownInCatchVariables=true`, `noImplicitOverride=true`, `forceConsistentCasingInFileNames=true`, `isolatedModules=true`, `verbatimModuleSyntax=true`, `moduleDetection=force`, `skipLibCheck=false`, `noEmitOnError=true`, `types=[]`. `module`, `moduleResolution`, `lib`, `rootDir`, `outDir`, declarations и source maps задаются workspace configs, а не угадываются из root.

### Module/compiler matrix

| Workspace | `module` | `moduleResolution` | `lib` | JSX | Emit |
|---|---|---|---|---|---|
| `apps/api` | `NodeNext` | `NodeNext` | `ES2023` | none | JS + source maps; declarations off |
| `apps/web` | `ESNext` | `Bundler` | `ES2023`, `DOM`, `DOM.Iterable` | `react-jsx` | JS + source maps; declarations off |
| `packages/contracts` | `NodeNext` | `NodeNext` | `ES2023` | none | JS + `.d.ts` + source maps + declaration maps |
| `packages/domain` | `NodeNext` | `NodeNext` | `ES2023` | none | JS + `.d.ts` + source maps + declaration maps |
| `packages/db` | `NodeNext` | `NodeNext` | `ES2023` | none | JS + `.d.ts` + source maps + declaration maps |

Все `tsconfig.json` обязаны `extends` ровно `../../tsconfig.base.json`. `apps/api` и `packages/db` override `types=["node"]`; `apps/web`, `packages/contracts`, `packages/domain` наследуют exact empty `types=[]`, чтобы Node ambient globals не попадали в browser/platform-neutral boundaries. Shared packages устанавливают `composite=true`, `declaration=true`, `declarationMap=true`, `sourceMap=true`, `rootDir=src`, `outDir=dist`, `tsBuildInfoFile=dist/.tsbuildinfo`. Apps устанавливают `declaration=false`, `sourceMap=true`, `rootDir=src`, `outDir=dist`.

Каждый workspace config имеет только top-level keys `extends`, `compilerOptions`, `include`, `exclude`; `include=["src/index.ts"]`, `exclude=["dist","node_modules"]`; project references и path aliases отсутствуют. Build каждого workspace включает только `src/index.ts`; structural smoke test выполняется Vitest и не публикуется в `dist`.

## 11. Workspace Naming / Import Boundaries

| Path | Exact package name | Version | Private | Boundary owner after W0 |
|---|---|---:|---|---|
| `apps/api` | `@max-smart-city/api` | `0.0.0` | yes | TG-003 and later explicit owners |
| `apps/web` | `@max-smart-city/web` | `0.0.0` | yes | TG-004 and later explicit owners |
| `packages/contracts` | `@max-smart-city/contracts` | `0.0.0` | yes | TG-002 |
| `packages/domain` | `@max-smart-city/domain` | `0.0.0` | yes | TG-009 |
| `packages/db` | `@max-smart-city/db` | `0.0.0` | yes | TG-005–TG-008 sequential data lane |

Rules:

1. Cross-workspace imports используют только exact package names выше.
2. Запрещены cross-workspace relative imports (`../../packages/...`), imports из чужого `src/**` и undeclared deep imports.
3. Shared packages экспортируют только public entry point `.` из `dist/index.js` с types `dist/index.d.ts`.
4. Internal workspace dependency version — exact `0.0.0`, а не `*`, `workspace:*`, `^` или `~`.
5. `apps/api` декларирует `@max-smart-city/contracts`, `@max-smart-city/domain`, `@max-smart-city/db` как dependencies `0.0.0`.
6. `apps/web` декларирует только `@max-smart-city/contracts` как dependency `0.0.0`; web не импортирует DB или backend domain engine.
7. TG-001 placeholders не импортируют feature APIs и ничего не экспортируют.

Exact manifest key policy:

| Manifest class | Разрешённые top-level keys |
|---|---|
| root | `name`, `version`, `private`, `type`, `packageManager`, `engines`, `workspaces`, `scripts`, `devDependencies` |
| `apps/api` | `name`, `version`, `private`, `type`, `scripts`, `dependencies` |
| `apps/web` | `name`, `version`, `private`, `type`, `scripts`, `dependencies` |
| each shared package | `name`, `version`, `private`, `type`, `files`, `types`, `exports`, `scripts` |

Для root: `name=max-smart-city`, `version=0.0.0`, `private=true`. Для всех workspaces: `version=0.0.0`, `private=true`. Apps не имеют `main`/`exports`. У shared packages `files=["dist"]`, `types=./dist/index.d.ts`, а `exports` имеет ровно key `.` со значениями `types=./dist/index.d.ts` и `import=./dist/index.js`; `require`, `default`, subpath exports и source exports отсутствуют. Дополнительные manifest keys/dependencies/scripts в TG-001 запрещены.

## 12. Dependency Manifest

В счётчиках этого контракта required dependency — одна direct TG-001 manifest declaration (`workspace + package`). Internal links учитываются. Required now: **8**. Deferred inventory: **16 informational rows**, которые не являются TG-001 declarations или version pins.

### A. REQUIRED NOW

| Workspace owner | Dependency | Exact Version | Type | Required in TG-001? | Reason | Canonical Source |
|---|---|---:|---|---|---|---|
| root | `typescript` | `7.0.2` | devDependency | YES | compiler/typecheck/build baseline | [npm](https://www.npmjs.com/package/typescript/v/7.0.2) |
| root | `vitest` | `5.0.1` | devDependency | YES | honest structural smoke runner | [npm](https://www.npmjs.com/package/vitest/v/5.0.1) |
| root | `vite` | `8.3.0` | devDependency | YES | mandatory exact peer of Vitest 5; not a web shell implementation | [npm](https://www.npmjs.com/package/vite/v/8.3.0) |
| root | `@types/node` | `24.13.6` | devDependency | YES | Node 24 type baseline used by test/tooling declarations | [npm](https://www.npmjs.com/package/@types/node/v/24.13.6) |
| `apps/api` | `@max-smart-city/contracts` | `0.0.0` | dependency | YES | pin API → shared HTTP contract boundary | local workspace |
| `apps/api` | `@max-smart-city/domain` | `0.0.0` | dependency | YES | pin API → pure domain boundary | local workspace |
| `apps/api` | `@max-smart-city/db` | `0.0.0` | dependency | YES | pin API → persistence boundary | local workspace |
| `apps/web` | `@max-smart-city/contracts` | `0.0.0` | dependency | YES | pin web → shared contract boundary | local workspace |

Root `devDependencies` содержит ровно четыре external entries выше. Никакая **external** production dependency в TG-001 не устанавливается; четыре internal workspace declarations остаются типом `dependency`.

### B. DEFER TO OWNER TASK

Этот inventory фиксирует только package ownership и причину будущего использования. Он не выбирает и не утверждает версии. **Future owner Task Contract MUST independently select, verify and exact-pin the dependency version against its own stable `BASE_SHA`.** Это правило обязательно для TG-002, TG-003, TG-004, TG-005 и TG-028. Future owner не наследует version choice из TG-001 и выполняет актуальную official-source compatibility проверку в собственном contract pass.

| Dependency | Owning Task | Reason | Canonical approved technology source |
|---|---|---|---|
| `zod` for `packages/contracts` | TG-002 | actual shared HTTP/product schemas | [Zod package](https://www.npmjs.com/package/zod) |
| `fastify` | TG-003 | actual backend runtime skeleton | [Fastify package](https://www.npmjs.com/package/fastify) |
| `pino` | TG-003 | structured runtime logging | [Pino package](https://www.npmjs.com/package/pino) |
| `zod` for `apps/api` | TG-003 | central config/environment validation | [Zod package](https://www.npmjs.com/package/zod) |
| `react` | TG-004 | actual Mini App shell | [React package](https://www.npmjs.com/package/react) |
| `react-dom` | TG-004 | DOM renderer | [React DOM package](https://www.npmjs.com/package/react-dom) |
| `react-router-dom` | TG-004 | approved React Router browser integration | [React Router DOM package](https://www.npmjs.com/package/react-router-dom) |
| `@tanstack/react-query` | TG-004 | approved server-state baseline | [TanStack Query package](https://www.npmjs.com/package/@tanstack/react-query) |
| workspace-local `vite` for `apps/web` | TG-004 | actual web build declaration; distinct from root Vite required now as Vitest peer | [Vite package](https://www.npmjs.com/package/vite) |
| `@vitejs/plugin-react` | TG-004 | React transform for Vite | [Vite React plugin package](https://www.npmjs.com/package/@vitejs/plugin-react) |
| `@types/react` | TG-004 | React TypeScript declarations | [package](https://www.npmjs.com/package/@types/react) |
| `@types/react-dom` | TG-004 | React DOM TypeScript declarations | [package](https://www.npmjs.com/package/@types/react-dom) |
| `kysely` | TG-005 | actual typed SQL/migration foundation | [Kysely package](https://www.npmjs.com/package/kysely) |
| `pg` | TG-005 | actual PostgreSQL driver | [pg package](https://www.npmjs.com/package/pg) |
| `@types/pg` | TG-005 | pg TypeScript declarations | [package](https://www.npmjs.com/package/@types/pg) |
| `@playwright/test` | TG-028 | browser E2E belongs to later QA task | [Playwright Test package](https://www.npmjs.com/package/@playwright/test) |

No range tokens `^`, `~`, `latest`, `*` are permitted for the **eight TG-001 required-now direct declarations**. Lockfile remains authoritative for their transitive resolution. This clause does not pin future-owner versions.

## 13. Root Scripts

Root `package.json` scripts are exact:

| Script | Exact command | TG-001 semantics | Expected exit behavior |
|---|---|---|---|
| `build` | `npm run build --workspaces` | builds all five boundaries in exact workspace order | `0` only when every workspace TypeScript build succeeds |
| `typecheck` | `npm run typecheck --workspaces` | typechecks all five boundaries with no emit | `0` only when every workspace succeeds |
| `test` | `npm run test --workspaces` | runs five structural boundary tests | `0` only when five real structural tests pass; no `passWithNoTests` |
| `test:integration` | `node -e "console.log('NO_SUITE_YET: integration; owner=TG-026; status=NOT_RUN')"` | declares that real PostgreSQL/API/concurrency suite is not part of TG-001 | deterministic `0`, exact marker printed; must not print/pass a test count |
| `test:e2e` | `node -e "console.log('NO_SUITE_YET: e2e; owner=TG-028; status=NOT_RUN')"` | declares that Playwright suite is not part of TG-001 | deterministic `0`, exact marker printed; must not invoke/install Playwright |

`--if-present`, `|| true`, `passWithNoTests`, dummy success assertions and swallowed non-zero exits запрещены.

No-suite-yet commands — explicit gate semantics, а не доказательство integration/E2E coverage. Отчёт TG-001 обязан назвать их `NOT_RUN / OWNER TASK DEFERRED`, не `PASS`.

## 14. Workspace Scripts

Каждый из пяти workspace manifests обязан иметь ровно три TG-001 scripts:

| Script | Exact command |
|---|---|
| `build` | `tsc -p tsconfig.json` |
| `typecheck` | `tsc -p tsconfig.json --noEmit` |
| `test` | `vitest run src/index.test.ts` |

Не создавать `start`, `dev`, `serve`, `migrate`, `seed`, `deploy` или runtime process scripts. Они принадлежат owner tasks.

## 15. Minimal Placeholder Rules

Для каждого из пяти `src/index.ts`:

- exact semantic content: empty ESM module boundary;
- exact file content после нормализации line ending/trailing newline: только `export {};`; comments запрещены для machine-verifiable emptiness;
- экспортируемые runtime values/types отсутствуют;
- imports отсутствуют;
- side effects, environment reads, network/DB access, framework bootstrap и business logic запрещены.

Для каждого `src/index.test.ts`:

- импортирует соответствующий local `index.ts` boundary через ESM-compatible import;
- объективно проверяет, что boundary importable и public export set пуст;
- не утверждает product behavior;
- не содержит `expect(true).toBe(true)`, snapshots продукта, fake Case/state/role/data fixtures;
- test name явно содержит `TG-001 structural boundary smoke`.

Следующие owners расширяют/replaces boundaries:

| Placeholder | Следующий owner |
|---|---|
| `apps/api/src/index.ts` | TG-003 |
| `apps/web/src/index.ts` | TG-004 |
| `packages/contracts/src/index.ts` | TG-002 |
| `packages/domain/src/index.ts` | TG-009 |
| `packages/db/src/index.ts` | TG-005 |

## 16. Deterministic Implementation Instructions

Future coding-agent действует в этом порядке:

1. Выполнить preconditions § 5; при mismatch stop.
2. Создать только 25 whitelist files § 6; directory creation разрешена только как parent для этих files.
3. Root manifest зафиксировать как private ESM package `max-smart-city`, version `0.0.0`, Node/npm/workspaces/scripts/dependencies ровно по §§ 8–14.
4. Создать `.npmrc` ровно из трёх строк `engine-strict=true`, `package-lock=true`, `save-exact=true`. Создать `.gitignore` ровно из строк `node_modules/`, `dist/`, `coverage/`, `*.tsbuildinfo`, `playwright-report/`, `test-results/`, `.env`, `.env.*`, `!.env.example`; дополнительные patterns в TG-001 запрещены.
5. Создать base/workspace TS configs ровно по § 10; никаких aliases к чужому `src`.
6. Создать пять private workspace manifests и четыре exact internal links по § 11.
7. Создать только placeholders/tests § 15.
8. При exact Node/npm baseline выполнить `npm install --package-lock-only --ignore-scripts`; получить root lockfile v3.
9. Выполнить `npm ci`, затем verification § 18.
10. Не исправлять failures расширением scope. Если для прохождения требуется forbidden file/dependency/technology, применить § 23.
11. Только после всех AC stage exact whitelist, проверить staged diff, human Git identity, commit/push § 21.

TG-001 implementation agent не меняет четыре external required-now versions или четыре internal `0.0.0` links и не выполняет их version discovery повторно. Versions из informational deferred inventory не принадлежат TG-001; их independently selects/verifies/exact-pins соответствующий future owner Task Contract against its own stable `BASE_SHA`.

## 17. Acceptance Criteria

### Required AC

- **AC-001 — Reproducible install.** Clean checkout `BASE_SHA` + approved implementation выполняет `npm ci` с exit `0` при Node 24.21.0/npm 11.19.0.
- **AC-002 — npm only.** Package manager — только npm; root metadata равно `npm@11.19.0`.
- **AC-003 — Single lockfile.** В repository существует ровно один `package-lock.json`, только в root.
- **AC-004 — Five workspaces.** `npm query .workspace` возвращает ровно пять paths § 8, без лишних.
- **AC-005 — Unique names.** Все пять exact names § 11 существуют и уникальны.
- **AC-006 — TS inheritance.** Каждый workspace config extends root `tsconfig.base.json`; effective configs parse without errors.
- **AC-007 — Typecheck.** Root `npm run typecheck` exit `0`, участвуют все пять workspaces.
- **AC-008 — Build.** Root `npm run build` exit `0`; каждый workspace создаёт только свой `dist/**`.
- **AC-009 — Honest unit baseline.** Root `npm test` запускает ровно пять structural boundary smoke tests; все проходят; fake business assertions и empty-suite success отсутствуют.
- **AC-010 — Integration command.** `npm run test:integration` существует, печатает exact `NO_SUITE_YET: integration; owner=TG-026; status=NOT_RUN`, exit `0`, не утверждает PASS.
- **AC-011 — E2E command.** `npm run test:e2e` существует, печатает exact `NO_SUITE_YET: e2e; owner=TG-028; status=NOT_RUN`, exit `0`, Playwright не установлен/не вызван.
- **AC-012 — Exact direct dependencies.** Все 8 required-now direct declarations exact-pinned; запрещённые range tokens отсутствуют.
- **AC-013 — Lock reproducibility.** Lockfile v3 committed; удаление generated install state и повторный `npm ci` succeeds без изменения tracked files.
- **AC-014 — No alternate lockfiles.** `yarn.lock`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `bun.lock`, `bun.lockb` отсутствуют.
- **AC-015 — No product logic.** В новых source files отсутствуют Case/state/role/auth/route/UI/runtime implementations.
- **AC-016 — No migrations.** Migration/schema/seed files и DB runtime code отсутствуют.
- **AC-017 — No Docker.** Docker/compose artifacts отсутствуют.
- **AC-018 — No secrets.** `.env*`, tokens, credentials, connection strings и private keys не созданы; exception future `.env.example` не создаётся в TG-001.
- **AC-019 — No forbidden technologies.** Нет dependencies/configs для Redis, queues, GraphQL, WebSocket/SSE, microservices, alternate frameworks/package managers.
- **AC-020 — Diff whitelist.** Unstaged/staged diff относительно `BASE_SHA` ограничен ровно 25 paths § 6.

### Additional TG-001 AC

- **AC-021 — Runtime exactness.** `node --version` = `v24.21.0`; `npm --version` = `11.19.0`; engines и `.npmrc` это enforce.
- **AC-022 — ESM only.** Root/workspaces имеют `type=module`; shared `exports` содержит только ESM `import` + `types`; CJS/`require` source/build отсутствует.
- **AC-023 — Output policy.** Shared packages emit JS, `.d.ts`, source maps и declaration maps в собственный `dist`; apps do not emit declarations.
- **AC-024 — Deferred packages absent.** Package names из 16 informational rows § 12B отсутствуют как TG-001 direct declarations у соответствующих future-owner manifests. Отдельная required-now declaration root `vite@8.3.0` разрешена только как exact Vitest peer; `apps/web` не декларирует Vite до TG-004. Playwright browser binaries не скачиваются. Future versions этим AC не выбираются и не проверяются.
- **AC-025 — Import boundaries.** Internal links используют exact names/version `0.0.0`; cross-workspace relative/deep source imports отсутствуют.
- **AC-026 — No fake success switches.** Manifest scripts не содержат `--passWithNoTests`, `--if-present`, `|| true` или error swallowing.
- **AC-027 — IC-0 readiness and ownership.** После cleanup generated artifacts tracked diff не меняется; implementation branch `codex/tg-001-workspace-foundation` имеет verified implementation commit и статус `IC-0 READY`. Этот commit не является stable checkpoint. Stable `main` checkpoint создаёт только отдельный Integration Agent после independent IC-0 verification/merge/push.

## 18. Verification Commands

Выполнять строго по порядку из repository root в PowerShell 7.4 или новее. В начале каждой verification session выполнить fail-closed prologue; после него любой non-zero native exit останавливает script/commit/push:

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
```

### 1. Baseline verification — до изменений

```powershell
git status --short
git status
git branch --show-current
git rev-parse HEAD
git log -5 --oneline --decorate
$repoRoot = (git rev-parse --show-toplevel).Trim().Replace('\','/')
if ($repoRoot -eq 'C:/') { throw 'WRONG_REPOSITORY_ROOT' }
$originUrl = (git remote get-url origin).Trim().TrimEnd('/')
if ($originUrl -notin @(
  'https://github.com/WorkD69/MAX_hackathon_2026-',
  'https://github.com/WorkD69/MAX_hackathon_2026-.git'
)) { throw 'WRONG_ORIGIN_REMOTE' }
if ((git rev-parse HEAD).Trim() -ne '1b2206899322ac4416a578a1fa5f50b336d9cab5') { throw 'BASELINE_MISMATCH' }
if (git status --short) { throw 'BASELINE_MISMATCH: worktree is not clean' }
if ((git branch --show-current).Trim() -ne 'codex/tg-001-workspace-foundation') { throw 'TASK_BRANCH_REQUIRED' }
$PSNativeCommandUseErrorActionPreference = $false
git merge-base --is-ancestor '1b2206899322ac4416a578a1fa5f50b336d9cab5' HEAD
$branchBaseExit = $LASTEXITCODE
$PSNativeCommandUseErrorActionPreference = $true
if ($branchBaseExit -ne 0) { throw 'TASK_BRANCH_BASE_MISMATCH' }
if ((node --version).Trim() -ne 'v24.21.0') { throw 'NODE_NPM_BASELINE_MISMATCH' }
if ((npm --version).Trim() -ne '11.19.0') { throw 'NODE_NPM_BASELINE_MISMATCH' }
```

### 2. Lockfile generation and reproducible install

```powershell
npm install --package-lock-only --ignore-scripts
$lockHashBefore = (Get-FileHash -Algorithm SHA256 package-lock.json).Hash
npm ci
$lockHashAfter = (Get-FileHash -Algorithm SHA256 package-lock.json).Hash
if ($lockHashBefore -ne $lockHashAfter) { throw 'LOCKFILE_CHANGED_DURING_NPM_CI' }
```

### 3. Workspace enumeration

```powershell
npm query .workspace
$expected = @('packages/contracts','packages/domain','packages/db','apps/api','apps/web')
$actual = @(npm query .workspace --json | ConvertFrom-Json | ForEach-Object { $_.location })
if (@(Compare-Object $expected $actual).Count -ne 0) { throw 'WORKSPACE_SET_MISMATCH' }
npm pkg get name --workspaces
node --input-type=module -e "import fs from 'node:fs'; const p=JSON.parse(fs.readFileSync('package.json','utf8')); const e=['packages/contracts','packages/domain','packages/db','apps/api','apps/web']; if(JSON.stringify(p.workspaces)!==JSON.stringify(e)) throw new Error('WORKSPACE_ORDER_MISMATCH');"
node --input-type=module -e "import fs from 'node:fs'; const p=['packages/contracts','packages/domain','packages/db','apps/api','apps/web']; const n=p.map(x=>JSON.parse(fs.readFileSync(x+'/package.json','utf8')).name); if(new Set(n).size!==5) throw new Error('WORKSPACE_NAMES_NOT_UNIQUE');"
node --input-type=module -e "import fs from 'node:fs'; const read=f=>JSON.parse(fs.readFileSync(f,'utf8')); const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b); const keys=(o)=>Object.keys(o).sort(); const common={build:'tsc -p tsconfig.json',typecheck:'tsc -p tsconfig.json --noEmit',test:'vitest run src/index.test.ts'}; const specs=[['apps/api/package.json','@max-smart-city/api',['name','version','private','type','scripts','dependencies']],['apps/web/package.json','@max-smart-city/web',['name','version','private','type','scripts','dependencies']],['packages/contracts/package.json','@max-smart-city/contracts',['name','version','private','type','files','types','exports','scripts']],['packages/domain/package.json','@max-smart-city/domain',['name','version','private','type','files','types','exports','scripts']],['packages/db/package.json','@max-smart-city/db',['name','version','private','type','files','types','exports','scripts']]]; for(const [f,n,k] of specs){const p=read(f); if(!same(keys(p),[...k].sort())||p.name!==n||p.version!=='0.0.0'||p.private!==true||p.type!=='module'||!same(p.scripts,common)) throw new Error('WORKSPACE_MANIFEST_MISMATCH: '+f);} const r=read('package.json'); const rk=['name','version','private','type','packageManager','engines','workspaces','scripts','devDependencies'].sort(); if(!same(keys(r),rk)||r.name!=='max-smart-city'||r.version!=='0.0.0'||r.private!==true||r.type!=='module'||r.packageManager!=='npm@11.19.0'||!same(r.engines,{node:'24.21.0',npm:'11.19.0'})) throw new Error('ROOT_MANIFEST_MISMATCH'); const dq=String.fromCharCode(34),sq=String.fromCharCode(39); const ri='node -e '+dq+'console.log('+sq+'NO_SUITE_YET: integration; owner=TG-026; status=NOT_RUN'+sq+')'+dq; const re='node -e '+dq+'console.log('+sq+'NO_SUITE_YET: e2e; owner=TG-028; status=NOT_RUN'+sq+')'+dq; const rs={build:'npm run build --workspaces',typecheck:'npm run typecheck --workspaces',test:'npm run test --workspaces','test:integration':ri,'test:e2e':re}; if(!same(r.scripts,rs)) throw new Error('ROOT_SCRIPTS_MISMATCH'); for(const p of specs.slice(2)){const m=read(p[0]); if(!same(m.files,['dist'])||m.types!=='./dist/index.d.ts'||!same(m.exports,{'.':{types:'./dist/index.d.ts',import:'./dist/index.js'}})) throw new Error('SHARED_EXPORTS_MISMATCH: '+p[0]);}"
node --input-type=module -e "import fs from 'node:fs'; const read=f=>JSON.parse(fs.readFileSync(f,'utf8')); const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):x; const same=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b)); const base=read('tsconfig.base.json'); const b={target:'ES2023',strict:true,noUncheckedIndexedAccess:true,exactOptionalPropertyTypes:true,useUnknownInCatchVariables:true,noImplicitOverride:true,forceConsistentCasingInFileNames:true,isolatedModules:true,verbatimModuleSyntax:true,moduleDetection:'force',skipLibCheck:false,noEmitOnError:true,types:[]}; if(!same(base,{compilerOptions:b})) throw new Error('BASE_TSCONFIG_MISMATCH'); const app=(module,moduleResolution,lib,extra={})=>({module,moduleResolution,lib,rootDir:'src',outDir:'dist',declaration:false,sourceMap:true,...extra}); const shared=(extra={})=>({module:'NodeNext',moduleResolution:'NodeNext',lib:['ES2023'],rootDir:'src',outDir:'dist',composite:true,declaration:true,declarationMap:true,sourceMap:true,tsBuildInfoFile:'dist/.tsbuildinfo',...extra}); const expected={'apps/api/tsconfig.json':app('NodeNext','NodeNext',['ES2023'],{types:['node']}),'apps/web/tsconfig.json':app('ESNext','Bundler',['ES2023','DOM','DOM.Iterable'],{jsx:'react-jsx'}),'packages/contracts/tsconfig.json':shared(),'packages/domain/tsconfig.json':shared(),'packages/db/tsconfig.json':shared({types:['node']})}; for(const [f,c] of Object.entries(expected)){const p=read(f); const e={extends:'../../tsconfig.base.json',compilerOptions:c,include:['src/index.ts'],exclude:['dist','node_modules']}; if(!same(p,e)) throw new Error('WORKSPACE_TSCONFIG_MISMATCH: '+f);}"
```

### 4. Typecheck

```powershell
npm run typecheck
```

### 5. Build

```powershell
npm run build
$expectedBuild = @('apps/api/dist/index.js','apps/api/dist/index.js.map','apps/web/dist/index.js','apps/web/dist/index.js.map','packages/contracts/dist/.tsbuildinfo','packages/contracts/dist/index.d.ts','packages/contracts/dist/index.d.ts.map','packages/contracts/dist/index.js','packages/contracts/dist/index.js.map','packages/domain/dist/.tsbuildinfo','packages/domain/dist/index.d.ts','packages/domain/dist/index.d.ts.map','packages/domain/dist/index.js','packages/domain/dist/index.js.map','packages/db/dist/.tsbuildinfo','packages/db/dist/index.d.ts','packages/db/dist/index.d.ts.map','packages/db/dist/index.js','packages/db/dist/index.js.map')
$actualBuild = @(Get-ChildItem -File -Recurse apps,packages | Where-Object { $_.FullName -match '[\\/]dist[\\/]' } | ForEach-Object { $_.FullName.Substring($repoRoot.Length + 1).Replace('\','/') } | Sort-Object)
if (@(Compare-Object ($expectedBuild | Sort-Object) $actualBuild).Count -ne 0) { throw 'BUILD_OUTPUT_SET_MISMATCH' }
```

### 6. Structural tests

```powershell
npm test
npm exec -- vitest run apps/api/src/index.test.ts apps/web/src/index.test.ts packages/contracts/src/index.test.ts packages/domain/src/index.test.ts packages/db/src/index.test.ts --reporter=json --outputFile=test-results/vitest.json
$testJson = Get-Content -Raw -LiteralPath 'test-results/vitest.json' | ConvertFrom-Json
if ($testJson.numTotalTests -ne 5 -or $testJson.numPassedTests -ne 5 -or $testJson.numFailedTests -ne 0) { throw 'STRUCTURAL_TEST_COUNT_MISMATCH' }
$testNames = @($testJson.testResults.assertionResults | ForEach-Object { $_.fullName })
if (@($testNames | Where-Object { $_ -notmatch 'TG-001 structural boundary smoke' }).Count -ne 0) { throw 'STRUCTURAL_TEST_NAME_MISMATCH' }
```

Expected: five test files, five passed structural tests, zero failed, zero business tests.

### 7. Integration command

```powershell
$integration = npm run test:integration 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw 'test:integration failed' }
if ($integration -notmatch 'NO_SUITE_YET: integration; owner=TG-026; status=NOT_RUN') { throw 'INTEGRATION_SEMANTICS_MISMATCH' }
```

### 8. E2E command

```powershell
$e2e = npm run test:e2e 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { throw 'test:e2e failed' }
if ($e2e -notmatch 'NO_SUITE_YET: e2e; owner=TG-028; status=NOT_RUN') { throw 'E2E_SEMANTICS_MISMATCH' }
```

### 9. Dependency and lockfile checks

```powershell
npm ls --all
node --input-type=module -e "import fs from 'node:fs'; const files=['package.json','apps/api/package.json','apps/web/package.json','packages/contracts/package.json','packages/domain/package.json','packages/db/package.json']; for(const f of files){const p=JSON.parse(fs.readFileSync(f)); for(const k of ['dependencies','devDependencies']) for(const [n,v] of Object.entries(p[k]??{})){if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v)) throw new Error(f+': '+n+'='+v);}}"
node --input-type=module -e "import fs from 'node:fs'; const x={ 'package.json':{devDependencies:{typescript:'7.0.2',vitest:'5.0.1',vite:'8.3.0','@types/node':'24.13.6'}}, 'apps/api/package.json':{dependencies:{'@max-smart-city/contracts':'0.0.0','@max-smart-city/domain':'0.0.0','@max-smart-city/db':'0.0.0'}}, 'apps/web/package.json':{dependencies:{'@max-smart-city/contracts':'0.0.0'}}, 'packages/contracts/package.json':{}, 'packages/domain/package.json':{}, 'packages/db/package.json':{} }; const n=o=>Object.fromEntries(Object.entries(o??{}).sort()); for(const [f,e] of Object.entries(x)){const p=JSON.parse(fs.readFileSync(f,'utf8')); for(const k of ['dependencies','devDependencies']) if(JSON.stringify(n(p[k]))!==JSON.stringify(n(e[k]))) throw new Error('DEPENDENCY_SET_MISMATCH: '+f+':'+k);}"
$scanFiles = @(Get-ChildItem -LiteralPath $repoRoot -Recurse -Force -File -ErrorAction Stop | ForEach-Object { [IO.Path]::GetRelativePath($repoRoot, $_.FullName).Replace('\','/') } | Where-Object { $_ -notmatch '(^|/)(\.git|node_modules|dist)(/|$)' })
$locks = @($scanFiles | Where-Object { [IO.Path]::GetFileName($_) -eq 'package-lock.json' })
if ($locks.Count -ne 1 -or $locks[0] -ne 'package-lock.json') { throw 'LOCKFILE_COUNT_MISMATCH' }
node --input-type=module -e "import p from './package-lock.json' with {type:'json'}; if(p.lockfileVersion!==3) throw new Error('LOCKFILE_VERSION_MISMATCH');"
node --input-type=module -e "import fs from 'node:fs'; const l=JSON.parse(fs.readFileSync('package-lock.json','utf8')); const same=(a,b)=>JSON.stringify(Object.fromEntries(Object.entries(a??{}).sort()))===JSON.stringify(Object.fromEntries(Object.entries(b??{}).sort())); const root={typescript:'7.0.2',vitest:'5.0.1',vite:'8.3.0','@types/node':'24.13.6'}; if(!same(l.packages?.['']?.devDependencies,root)) throw new Error('LOCK_ROOT_DIRECT_DEPS_MISMATCH'); const specs={'apps/api':{name:'@max-smart-city/api',dependencies:{'@max-smart-city/contracts':'0.0.0','@max-smart-city/domain':'0.0.0','@max-smart-city/db':'0.0.0'}},'apps/web':{name:'@max-smart-city/web',dependencies:{'@max-smart-city/contracts':'0.0.0'}},'packages/contracts':{name:'@max-smart-city/contracts'},'packages/domain':{name:'@max-smart-city/domain'},'packages/db':{name:'@max-smart-city/db'}}; for(const [path,e] of Object.entries(specs)){const p=l.packages?.[path]; if(!p||p.name!==e.name||p.version!=='0.0.0'||!same(p.dependencies,e.dependencies)) throw new Error('LOCK_WORKSPACE_ENTRY_MISMATCH: '+path);}"
```

### 10. Forbidden artifact checks

```powershell
$scanFiles = @(Get-ChildItem -LiteralPath $repoRoot -Recurse -Force -File -ErrorAction Stop | ForEach-Object { [IO.Path]::GetRelativePath($repoRoot, $_.FullName).Replace('\','/') } | Where-Object { $_ -notmatch '(^|/)(\.git|node_modules|dist)(/|$)' })
$alternateNames = @('yarn.lock','pnpm-lock.yaml','pnpm-workspace.yaml','bun.lock','bun.lockb')
$alternateLocks = @($scanFiles | Where-Object { [IO.Path]::GetFileName($_) -in $alternateNames })
if ($alternateLocks.Count -ne 0) { throw ('FORBIDDEN_PACKAGE_MANAGER_ARTIFACT: ' + ($alternateLocks -join ', ')) }
$forbidden = @($scanFiles | Where-Object {
  $name = [IO.Path]::GetFileName($_)
  $name -like 'Dockerfile*' -or
  $name -match '^(compose|docker-compose).*\.ya?ml$' -or
  $name -eq '.dockerignore' -or
  $name -like '.env*' -or
  $name -match '^openapi\.(ya?ml|json)$' -or
  $name -eq 'DATA-API.yaml' -or
  $_ -match '(?i)(^|/)[^/]*migration[^/]*(/|$)' -or
  $_ -match '(?i)(^|/)[^/]*seed[^/]*(/|$)'
})
if ($forbidden.Count -ne 0) { throw 'FORBIDDEN_ARTIFACT_FOUND' }
if (Test-Path tests/integration) { throw 'TG-026_SCOPE_LEAK' }
if (Test-Path tests/e2e) { throw 'TG-028_SCOPE_LEAK' }
node --input-type=module -e "import fs from 'node:fs'; const roots=['apps/api','apps/web','packages/contracts','packages/domain','packages/db']; const q=String.fromCharCode(39),d=String.fromCharCode(34); for(const r of roots){const i=fs.readFileSync(r+'/src/index.ts','utf8').trim(); if(i!=='export {};') throw new Error('NON_EMPTY_BOUNDARY: '+r); const t=fs.readFileSync(r+'/src/index.test.ts','utf8'); const local=t.includes('from '+q+'./index.js'+q)||t.includes('from '+d+'./index.js'+d); if(!local||!t.includes('TG-001 structural boundary smoke')||/expect\s*\(\s*true|Case|state machine|role|MAX|Fastify|React|Kysely|PostgreSQL/i.test(t)) throw new Error('STRUCTURAL_TEST_SCOPE_MISMATCH: '+r); }"
```

### 11. Git diff whitelist check

```powershell
$allowed = @('.gitignore','.npmrc','package.json','package-lock.json','tsconfig.base.json','apps/api/package.json','apps/api/tsconfig.json','apps/api/src/index.ts','apps/api/src/index.test.ts','apps/web/package.json','apps/web/tsconfig.json','apps/web/src/index.ts','apps/web/src/index.test.ts','packages/contracts/package.json','packages/contracts/tsconfig.json','packages/contracts/src/index.ts','packages/contracts/src/index.test.ts','packages/domain/package.json','packages/domain/tsconfig.json','packages/domain/src/index.ts','packages/domain/src/index.test.ts','packages/db/package.json','packages/db/tsconfig.json','packages/db/src/index.ts','packages/db/src/index.test.ts')
node --input-type=module -e "import fs from 'node:fs'; const lines=f=>fs.readFileSync(f,'utf8').replace(/\r/g,'').trimEnd().split('\n'); const gi=['node_modules/','dist/','coverage/','*.tsbuildinfo','playwright-report/','test-results/','.env','.env.*','!.env.example']; const nr=['engine-strict=true','package-lock=true','save-exact=true']; if(JSON.stringify(lines('.gitignore'))!==JSON.stringify(gi)) throw new Error('GITIGNORE_MISMATCH'); if(JSON.stringify(lines('.npmrc'))!==JSON.stringify(nr)) throw new Error('NPMRC_MISMATCH');"
$changed = @(git diff --name-only '1b2206899322ac4416a578a1fa5f50b336d9cab5' --)
$untracked = @(git ls-files --others --exclude-standard)
$observed = @($changed + $untracked | Sort-Object -Unique)
$outside = @($observed | Where-Object { $_ -notin $allowed })
if ($outside.Count -ne 0) { throw ('WRITE_SCOPE_VIOLATION: ' + ($outside -join ', ')) }
if (@(Compare-Object ($allowed | Sort-Object) ($observed | Sort-Object)).Count -ne 0) { throw 'REQUIRED_FILE_SET_MISMATCH' }
$ignored = @(git status --ignored --short | Where-Object { $_ -like '!! *' } | ForEach-Object { $_.Substring(3).Replace('\','/') })
$unexpectedIgnored = @($ignored | Where-Object { $_ -notmatch '(^|/)node_modules/$' -and $_ -notmatch '^(apps/api|apps/web|packages/contracts|packages/domain|packages/db)/dist/$' -and $_ -notmatch '^(coverage|playwright-report|test-results)/$' })
if ($unexpectedIgnored.Count -ne 0) { throw ('UNEXPECTED_IGNORED_ARTIFACT: ' + ($unexpectedIgnored -join ', ')) }
git diff --check
git diff --stat '1b2206899322ac4416a578a1fa5f50b336d9cab5'
git diff '1b2206899322ac4416a578a1fa5f50b336d9cab5' --
```

### 12. Staged diff validation — before commit

```powershell
git add -- .gitignore .npmrc package.json package-lock.json tsconfig.base.json apps/api/package.json apps/api/tsconfig.json apps/api/src/index.ts apps/api/src/index.test.ts apps/web/package.json apps/web/tsconfig.json apps/web/src/index.ts apps/web/src/index.test.ts packages/contracts/package.json packages/contracts/tsconfig.json packages/contracts/src/index.ts packages/contracts/src/index.test.ts packages/domain/package.json packages/domain/tsconfig.json packages/domain/src/index.ts packages/domain/src/index.test.ts packages/db/package.json packages/db/tsconfig.json packages/db/src/index.ts packages/db/src/index.test.ts
if ((git rev-parse HEAD).Trim() -ne '1b2206899322ac4416a578a1fa5f50b336d9cab5') { throw 'BASELINE_CHANGED_BEFORE_COMMIT' }
if ((git branch --show-current).Trim() -ne 'codex/tg-001-workspace-foundation') { throw 'TASK_BRANCH_REQUIRED' }
$staged = @(git diff --cached --name-only '1b2206899322ac4416a578a1fa5f50b336d9cab5' --)
$outsideStaged = @($staged | Where-Object { $_ -notin $allowed })
if ($outsideStaged.Count -ne 0) { throw ('STAGED_SCOPE_VIOLATION: ' + ($outsideStaged -join ', ')) }
if (@(Compare-Object ($allowed | Sort-Object) ($staged | Sort-Object)).Count -ne 0) { throw 'STAGED_FILE_SET_MISMATCH' }
$remainingUntracked = @(git ls-files --others --exclude-standard)
if ($remainingUntracked.Count -ne 0) { throw ('UNSTAGED_UNTRACKED_FILES: ' + ($remainingUntracked -join ', ')) }
git diff --exit-code --
git diff --exit-code -- package-lock.json
git diff --cached --check
git diff --cached --stat
git diff --cached
```

## 19. Negative / Scope Checks

До commit reviewer обязан подтвердить:

- deferred third-party packages § 12 отсутствуют в direct TG-001 manifests, кроме root Vite peer row;
- lockfile не содержит Playwright browser packages как direct dependency;
- нет `vite.config.*`, `index.html`, React/Fastify/Kysely/Zod/Pino runtime source;
- нет test configs или folders за пределами five structural smoke files;
- нет business vocabulary/fixtures в source/tests: Case states, roles, MAX identities, routes, DB tables;
- нет runtime process scripts;
- нет secrets и environment templates;
- package boundaries пусты и ESM-only;
- generated `node_modules`, `dist`, coverage и reports не staged;
- canonical docs/task graph не изменены.

## 20. Git Safety

Future implementation agent:

- не изменяет global/local Git config;
- не выполняет destructive cleanup неизвестных files;
- не использует `git reset --hard`, `git clean -fd`, `git restore .`, `git checkout -- <path>` для сокрытия scope issues;
- не переписывает history и не force-push;
- при baseline mismatch, dirty initial worktree, branch не `codex/tg-001-workspace-foundation` или detached implementation HEAD останавливается;
- stage выполняет только explicit path list § 18.12;
- canonical `BASE_SHA` остаётся `1b2206899322ac4416a578a1fa5f50b336d9cab5` на весь TG-001 implementation.

## 21. Commit / Push Protocol

После полного прохождения AC future coding-agent:

1. Выполняет staged checks § 18.12.
2. Проверяет existing human identity, временно отключая native-command exceptions только для двух read-only `git config --get` calls:

   ```powershell
   $PSNativeCommandUseErrorActionPreference = $false
   $gitUserName = git config --get user.name
   $gitUserNameExit = $LASTEXITCODE
   $gitUserEmail = git config --get user.email
   $gitUserEmailExit = $LASTEXITCODE
   $PSNativeCommandUseErrorActionPreference = $true
   if ($gitUserNameExit -ne 0 -or $gitUserEmailExit -ne 0 -or [string]::IsNullOrWhiteSpace(($gitUserName | Out-String)) -or [string]::IsNullOrWhiteSpace(($gitUserEmail | Out-String))) {
     Write-Output 'HUMAN_GIT_IDENTITY_REQUIRED'
     throw 'HUMAN_GIT_IDENTITY_REQUIRED'
   }
   ```

3. Если command exit non-zero или значение пусто: вывести `HUMAN_GIT_IDENTITY_REQUIRED` и остановиться. Git config не изменять.
4. Не меняет Git config, не использует `--author`, не добавляет Codex/OpenCode/OpenAI co-author trailers, `Generated-by` или `AI-assisted`.
5. Commit subject зафиксирован: `build(workspace): establish project foundation`.
6. Выполняет exact `git commit -m "build(workspace): establish project foundation"`; при non-zero exit stop.
7. Выполняет только exact `git push origin codex/tg-001-workspace-foundation`; при non-zero exit stop. `main`, `--force` и `--force-with-lease` запрещены.
8. Выполняет `git fetch origin codex/tg-001-workspace-foundation` и проверяет:

   ```powershell
   git rev-parse HEAD
   git rev-parse origin/codex/tg-001-workspace-foundation
   git status --short
   $localSha = (git rev-parse HEAD).Trim()
   $remoteSha = (git rev-parse origin/codex/tg-001-workspace-foundation).Trim()
   if ($localSha -ne $remoteSha) { throw 'IMPLEMENTATION_REMOTE_SHA_MISMATCH' }
   if (git status --short) { throw 'POST_PUSH_WORKTREE_NOT_CLEAN' }
   Write-Output "IMPLEMENTATION_COMMIT_SHA: $localSha"
   ```

9. Full pushed SHA — только `IMPLEMENTATION_COMMIT_SHA`. Он **не является** `TG-001 CHECKPOINT SHA`, не изменяет stable `main` и не разрешает Task Contracts TG-002–TG-005.

### Integration handoff / canonical IC-0 lifecycle

После implementation отдельный existing Integration Agent:

1. Принимает `IMPLEMENTATION_COMMIT_SHA` и independently проверяет весь TG-001 output против approved Task Contract.
2. Повторяет clean install, workspace enumeration, typecheck, build, structural tests, honest integration/E2E markers, dependency/lockfile и allowed-scope checks.
3. Проверяет root shared files и отсутствие production/future-task content.
4. Merge'ит approved implementation в `main` согласно repository governance; coding-agent не выполняет этот merge.
5. Push'ит stable `main` без force и проверяет remote `main` SHA.
6. Возвращает final full SHA как `TG-001 CHECKPOINT SHA`.

Только resulting stable `main` SHA Integration Agent становится `BASE_SHA` для TG-002, TG-003, TG-004 и TG-005. Это существующий Task Graph `IC-0 Workspace` lifecycle, не новый architecture/task gate.

## 22. Definition of Done

TG-001 implementation может считаться готовым к integration handoff только если одновременно:

- approved contract использован без отклонений;
- все machine-checkable части AC-001…AC-027 подтверждены fresh command output; semantic scope clauses AC-015/AC-018/AC-019 дополнительно подтверждены полным human-readable review staged diff без предположения, что keyword scan доказывает отсутствие логики;
- diff/staged diff ровно 25 files;
- source содержит только empty boundaries и structural smoke;
- five workspaces и one lockfile доказаны;
- direct dependencies exact и minimal;
- integration/E2E честно обозначены `NOT_RUN`, а не `PASS`;
- human identity подтверждена;
- task-branch commit/push завершён, local/remote task-branch full SHA совпадает;
- repository clean;
- возвращён `IMPLEMENTATION_COMMIT_SHA` и статус `IC-0 READY`;
- implementation agent не изменял/push'ил `main` и не объявлял stable checkpoint.

TG-001 checkpoint завершён только после отдельного Integration Agent lifecycle § 21: independent IC-0 verification, merge/push stable `main` и возврат `TG-001 CHECKPOINT SHA`. Только после этого могут создаваться WAVE 1 contracts на новом stable SHA.

После repository closure `IMPLEMENTATION = NOT STARTED`, `CODING = ALLOWED FOR TG-001 ONLY AFTER EXECUTION-ENVIRONMENT BOOTSTRAP`.

## 23. Blocker Protocol

Если contract implementation требует хотя бы одно из следующего:

- изменение Product Freeze, Product Spec, Architecture, Data Model, Interface Contracts или Task Graph;
- новую technology/framework/package manager;
- write вне whitelist;
- product/runtime logic TG-002–TG-005;
- другую Node/npm/module/workspace topology;
- TG-001 required-now dependency без exact approved version или owner;

agent обязан вернуть:

```text
TASK_CONTRACT_BLOCKER:
SPEC_OR_ARCHITECTURE_GAP

EXACT_ISSUE:
<конкретное отсутствующее/противоречивое правило>

AFFECTED_CANONICAL_SOURCE:
<exact path and section>

WHY_NON_DETERMINISTIC:
<почему нельзя продолжить без нового решения>
```

Для Git/runtime failures используются отдельные fail-closed statuses: `BASELINE_MISMATCH`, `WRONG_REPOSITORY_ROOT`, `WRONG_ORIGIN_REMOTE`, `NODE_NPM_BASELINE_MISMATCH`, `TASK_BRANCH_REQUIRED`, `TASK_BRANCH_BASE_MISMATCH`, `HUMAN_GIT_IDENTITY_REQUIRED`. Agent не импровизирует workaround.

## 24. Requirement Traceability

| Canonical source / requirement | Contract clause | Acceptance / verification |
|---|---|---|
| Task Graph TG-001: npm workspaces, one lockfile, shared scripts | §§ 3, 8, 13–14 | AC-001–AC-009; § 18.2–6 |
| Task Graph WAVE 0: runs alone, root freeze | §§ 3, 21–22 | AC-027; § 21 Integration handoff |
| Task Graph IC-0: clean install/build/typecheck/test skeleton | §§ 13–18 | AC-001, AC-007–AC-011 |
| Task Graph file ownership / collision policy | §§ 6–7, 20–21 | AC-020; § 18.11–12 |
| Stable SHA between waves | §§ 3, 21–22 | AC-027; § 21 Integration handoff |
| Architecture § 4 / ADR-008–009: TS, React/Vite, Fastify, Zod, PostgreSQL/Kysely/pg, Vitest/Playwright/Pino | §§ 9–12 | AC-012, AC-019, AC-021, AC-024 |
| Architecture § 6: one backend, one Mini App, shared boundaries | §§ 8, 11 | AC-004–AC-005, AC-025 |
| Architecture § 21: Docker later delivery output | § 7 | AC-017; § 18.10 |
| Architecture § 26 / ADR-026: Vitest, PostgreSQL integration, Playwright, live MAX separated | §§ 12–15 | AC-009–AC-011, AC-024, AC-026 |
| ADR-024: reproducibility/versioned migrations later | §§ 12, 17–18 | AC-001, AC-013, AC-016 |
| Hackathon Criteria §§ 3, 8: dependency versions, reproducibility, no secrets | §§ 9, 12, 17, 19 | AC-001, AC-012–AC-013, AC-018 |
| TG-002 owns actual Zod HTTP contracts | §§ 7, 12, 15 | AC-015, AC-024 |
| TG-003 owns Fastify/config/logging/health | §§ 7, 12, 15 | AC-015, AC-024 |
| TG-004 owns actual React/Vite shell | §§ 7, 12, 15 | AC-015, AC-024 |
| TG-005 owns DB migrations/schema | §§ 7, 12, 15 | AC-016, AC-024 |
| AGENTS/task template: exact SHA, allowed files, checks, human identity | §§ 5–7, 18, 20–21 | AC-020; § 18.1, 11–12 |

## 25. Architecture Decision Leakage Check

| Question | Pinned answer | Material choice remains? |
|---|---|---|
| Node version | `24.21.0` LTS | NO |
| npm version | `11.19.0`; `npm@11.19.0` | NO |
| Workspace paths | five exact paths § 8 | NO |
| Package names | five exact names § 11 | NO |
| ESM/CJS | ESM only | NO |
| TS target | `ES2023` | NO |
| Module resolution | NodeNext for API/shared; Bundler for web | NO |
| Output layout | per-workspace `dist`; shared declarations/maps | NO |
| Test baseline | Vitest structural smoke; explicit deferred integration/E2E | NO |
| Root scripts | exact commands § 13 | NO |
| Dependencies required now | eight exact declarations § 12A | NO |
| TG-001 required-now exact versions | four external exact pins + four internal `0.0.0` links | NO |
| Future dependency versions | `NOT OWNED BY TG-001`; каждый future owner выбирает/проверяет/exact-pin'ит версию на собственном stable `BASE_SHA` | NO — вне ownership TG-001 |
| Allowed files | 25 exact paths § 6 | NO |
| Forbidden files | exhaustive category/path boundary § 7 | NO |

Result: `NO MATERIAL CHOICE REMAINS` по всем обязательным вопросам TG-001.

## 26. Self-Status

```text
APPROVED / CANONICAL
```
