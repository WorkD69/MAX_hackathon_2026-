# TG-004 TASK CONTRACT

> Автор: EGOR. Статус: **APPROVED / PASS** — canonical Task Contract, канонизирован в repository. Coding разблокирован после repository closure.
> Репо-относительные пути считаются от корня `https://github.com/WorkD69/MAX_hackathon_2026-`.

## 1. Contract Identity

```text
TASK_ID = TG-004
TITLE = React/Vite Mini App skeleton
ASSIGNEE = EGOR
BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99
TASK_GRAPH_SCOPE_MATCH = YES
TASK_CONTRACT_STATUS = APPROVED
TASK_CONTRACT_GATE = PASS
CODING = UNBLOCKED AFTER REPOSITORY CLOSURE
```

`BASE_SHA` равен стабильному `main` после TG-001 integration (IC-0 checkpoint). Проверено на же используемом read-only authoring checkout: `git rev-parse HEAD` и `git rev-parse origin/main` после `git fetch --prune origin` оба возвращают `200b117bd58f7080c15fba1cfa556d386a085c99`, worktree clean, branch `main`.

## 2. Purpose

Создать детерминированный foundation `apps/web`: одну responsive React/Vite Mini App shell с React Router, TanStack Query и MAX platform adapter seam. Всё, что TG-004 не реализует, остаётся за владельцами соответствующих задач Task Graph. Никаких product flows, workflow UI, backend, DB, auth, DemoRun или E2E.

## 3. Canonical Sources (прочитаны из exact BASE_SHA)

1. `AGENTS.md` — правила `base_sha`, file ownership, Git identity, commit/push, запрет самостоятельных продуктовых решений.
2. `docs/00_PROJECT_BRIEF.md` — контекст Bot + Mini App, «подрядчик сообщил о выполнении ≠ проблема решена».
3. `docs/01_PRODUCT_FREEZE.md` — approved scope; TG-004 не реализует продуктовую логику.
4. `docs/02_PRODUCT_SPEC.md` §§ 20–21 — DEMO_MODE и Mini App обязательства; TG-004 не реализует их, а готовит shell. §§ 22.1–22.11, 24.9 (AC-061…AC-063) — error/refetch/409 семантика для QueryClient policy.
5. `docs/03_ARCHITECTURE.md` §§ 4.1, 6.1, 8.1–8.5, 26.7–26.8, 28 (ADR-015, ADR-025) — стек, Mini App shell, server-state, refresh, no-optimistic, mobile+web одна Mini App.
6. `docs/04_DATA_MODEL.md` — не реализуется; только не импортируется DB/domain.
7. `docs/05_INTERFACE_CONTRACTS.md` — схемы принадлежат TG-002; TG-004 не импортирует product schema symbols.
8. `docs/07_DECISIONS.md` — ADR-015, ADR-025 (обязательны для TG-004); прочие ADR не владеют web.
9. `docs/08_PROJECT_STATE.md` — `WAVE 1 TASK CONTRACTS`, TG-004 READY FOR TASK CONTRACT, coding blocked до approval.
10. `docs/09_HACKATHON_CRITERIA.md` §§ 3, 8 — версии exact-pinned, воспроизводимость, секреты не в репозитории.
11. `docs/ORCHESTRATOR_HANDOFF.md` — contracts перед coding, стабильный SHA между волнами.
12. `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md` — current gate и поля контракта.
13. `tasks/TASK_GRAPH.md` §§ 1–15 (TG-004, WAVE 1, LANE-C, IC-1, file collisions, dependency governance, deferred inventory § 3/12) — canonical definition TG-004.
14. `tasks/TG-001_TASK_CONTRACT.md` — frozen root surface, Node/npm baseline, workspace manifest/import policy, deferred dependency ownership.
15. `package.json`, `package-lock.json`, `tsconfig.base.json`, `.npmrc`, `.gitignore`, `apps/web/package.json`, `apps/web/tsconfig.json`, `packages/contracts/package.json`.

Версии dependencies проверены автором контракта 2026-09-23 по официальному npm registry metadata (`npm view <pkg> version|engines|peerDependencies|peerDependenciesMeta`); используются только stable releases без prerelease.

## 4. TG-004 Source Definition (canonical Task Graph § 3)

- **Type:** FRONTEND.
- **Execution Class:** A — Implementation.
- **Depends On:** TG-001.
- **Unlocks:** TG-020.
- **Parallel With:** TG-002, TG-003, TG-005 (Wave 1).
- **Primary Ownership:** LANE-C.
- **File / Module Scope:** `apps/web/src/app/**`, `apps/web/src/platform/**`, Vite config, base styles; центральный router composition остаётся у TG-004 до TG-029, который становится единственным owner final router registry.
- **Contract Sources:** Architecture §§ 6.1, 8; Product Spec §§ 20–21; ADR-015, ADR-025.
- **Required Outputs:** app shell; route outlet; QueryClient policy; platform adapter interface; pending/success/error primitives; responsive viewport baseline.
- **Acceptance Criteria:** одна app рендерится в mobile/web viewport; нет role-specific отдельных builds; query policy поддерживает refetch после command/409/focus/manual refresh; business state не хранится в client workflow store.
- **Required Tests:** component smoke; router smoke; viewport tests; QueryClient policy unit tests.
- **Forbidden / Must Not:** не доверять `initDataUnsafe`; не добавлять optimistic state transitions, WebSocket/SSE или four-app split.
- **Integration Notes:** feature routes/components подключаются из owned directories; TG-029 единственный правит final router registry после параллельной фронтовой работы.

## 5. Ownership Mapping (что именно владеет TG-004 в apps/web)

| Слой / артефакт | Решение | Таск-граф источник |
|---|---|---|
| `apps/web` shell ownership | LANE-C, единственный реализатор web foundation Wave 1 | Task Graph § 3 TG-004, § 6 LANE-C |
| Entry point | `apps/web/index.html` → `/src/main.tsx` → `createRoot(...).render` | Vite convention + Architecture § 8.3 (bootstrap) |
| Vite configuration | `apps/web/vite.config.ts`: `@vitejs/plugin-react`, `base:'/'`, `test` block (happy-dom) | TG-004 deferred `vite`, `@vitejs/plugin-react` |
| React bootstrap | `src/main.tsx`: `StrictMode` + `AppProviders` + `RouterProvider(createAppRouter())` | Architecture § 6.1 |
| QueryClient baseline | `src/app/query-client.ts`: singleton `queryClient` + `createQueryClient()` c exact-pinned `defaultOptions` | Architecture § 8.3–8.5; ADR-025; Product Spec § 22 |
| Router baseline | `src/app/router.tsx`: `createAppRouter()` (BrowserRouter), sleeve layout + Outlet; `src/app/routes.tsx`: seam `AppRouteModule` + pure `buildAppRoutes()` | Architecture § 6.1 «routes»; Task Graph TG-004/TG-029 router ownership |
| Central router ownership | `src/app/router.tsx` — sole owner TG-004 до TG-029; feature-задачи не редактируют router.tsx | Task Graph § 3 TG-004 «до TG-029», § 7 collision row TG-004 |
| Platform/API boundary | `src/platform/**`: `PlatformAdapter` interface + default browser adapter + `PlatformProvider`/`usePlatform` | Architecture § 6.1 «MAX platform adapter»; § 6.4 «UI не обращается к DB/MAX напрямую» |
| Shared contracts consumption | Web зависит от `@max-smart-city/contracts@0.0.0` (уже в TG-001). TG-004 НЕ импортирует product schema symbols (они появляются в TG-002) | Task Graph § 7 row TG-002/TG-004; TG-001 § 11/12 |
| Frontend test foundation | Vitest(5.0.1 root) + happy-dom; `vite.config.ts` test block; tests в `src/**/*.test.{ts,tsx}` с `TG-004` маркерами | Task Graph TG-004 Required Tests; Architecture § 26.1/26.7 (browser E2E позже — TG-028) |
| Build output | `vite build` → `apps/web/dist/` (`index.html` + `assets/**`) | TG-001 § 10 output policy (per-workspace `dist`) |
| Route contribution seam | `routes.tsx` `AppRouteModule {id, routes}` + `buildAppRoutes(modules)`; feature-задачи экспортируют модули, TG-029 их регистрирует | Task Graph TG-020–TG-025 «route descriptors», «route merge only TG-029» |

Не придуманы product flows; все элементы — только foundation. `Feature UI`, `Demo role-switch business`, `Case UI` НЕ реализуются.

## 6. Preconditions (исполнитель)

```powershell
git status --short
git status
git branch --show-current
git rev-parse HEAD
git log -5 --oneline --decorate
git remote get-url origin
git rev-parse --show-toplevel
```

Требуются одновременно:

- branch = `codex/tg-004-web-skeleton` (bootstrap orchestrator owns: `git switch --create codex/tg-004-web-skeleton 200b117bd58f7080c15fba1cfa556d386a085c99`; при существовании branch — не пересоздавать/не reset);
- `git rev-parse HEAD` = `200b117bd58f7080c15fba1cfa556d386a085c99`;
- worktree clean (`git status --short` пусто);
- `origin` = `https://github.com/WorkD69/MAX_hackathon_2026-` (allow `.git` suffix);
- `git rev-parse --show-toplevel` ≠ `C:/`;
- `node --version` = `v24.21.0`, `npm --version` = `11.19.0` (engines-strict enforce);
- `npm run build` и `npm run typecheck` на исходном BASE_SHA проходят (sanity: рабочая база).

Любое несоответствие → `BASELINE_MISMATCH` / `WRONG_REPOSITORY_ROOT` / `WRONG_ORIGIN_REMOTE` / `TASK_BRANCH_REQUIRED` / `NODE_NPM_BASELINE_MISMATCH`; остановиться. Запрещены `git reset --hard`, `git clean -fd`, `git restore .`, force push, правка Git config.

## 7. Allowed Write Scope — ровно 27 paths

**MODIFY (переданные TG-004 от TG-001 + change):**

1. `apps/web/package.json` — добавить `devDependencies`; scripts `build`/`typecheck`/`test`.
2. `apps/web/tsconfig.json` — только `include: ["src"]` (вместо `["src/index.ts"]`); остальные ключи неизменны.

**DELETE (TG-001 placeholders уходят с репозитория):**

3. `apps/web/src/index.ts`
4. `apps/web/src/index.test.ts`

**CREATE:**

5. `apps/web/index.html`
6. `apps/web/vite.config.ts`
7. `apps/web/src/main.tsx`
8. `apps/web/src/app/query-client.ts`
9. `apps/web/src/app/app-providers.tsx`
10. `apps/web/src/app/router.tsx`
11. `apps/web/src/app/routes.tsx`
12. `apps/web/src/app/test-render.tsx`
13. `apps/web/src/app/router.test.tsx`
14. `apps/web/src/app/routes.test.tsx`
15. `apps/web/src/app/query-client.test.ts`
16. `apps/web/src/app/viewport.test.tsx`
17. `apps/web/src/main.test.tsx`
18. `apps/web/src/platform/platform-adapter.ts`
19. `apps/web/src/platform/platform-context.tsx`
20. `apps/web/src/platform/platform-adapter.test.ts`
21. `apps/web/src/shell/app-shell.tsx`
22. `apps/web/src/shell/app-shell.test.tsx`
23. `apps/web/src/components/ui/pending-state.tsx`
24. `apps/web/src/components/ui/success-state.tsx`
25. `apps/web/src/components/ui/error-state.tsx`
26. `apps/web/src/styles/base.css`
27. `apps/web/src/vite-env.d.ts` — ровно `/// <reference types="vite/client" />` (семантика § 11.15)

Директории создаются только как parent для перечисленных files. `node_modules/**`, `dist/**`, `coverage/**`, `*.tsbuildinfo`, `test-results/**` — ignored generated artifacts, не stage'ятся.

## 8. Forbidden Write Scope

Любые изменения вне § 7, включая:

- `AGENTS.md`, `README.md`;
- все `docs/**` (включая 01–09 и ORCHESTRATOR_HANDOFF);
- все `tasks/**` (Task Graph, Template, Backlog, TG-001 contract);
- `package.json`, `package-lock.json`, `tsconfig.base.json`, `.npmrc`, `.gitignore` (root frozen surface);
- `apps/api/**`, `packages/contracts/**`, `packages/domain/**`, `packages/db/**`;
- `apps/web/src/features/**` (создаётся feature-задачами TG-020–TG-025);
- `tests/integration/**`, `tests/e2e/**`, `docs/evidence/**`;
- любые сайтовые плагины/build configs за пределами `apps/web/vite.config.ts`.

TG-004 не реализует: Case/state machine/roles/invariants; HTTP/Zod product contracts; backend routes/config/auth; DB/schema/seed; DemoRun/actor switch; MAX webhook/adapter/notification; attachments; `Dockerfile`/compose/`.env.example`; `openapi.yaml`/`DATA-API.yaml`; Playwright/scenarios; ESLint/Prettier/другие package managers/linters/Tailwind/Redux/Zustand.

## 9. Dependency Manifest — REQUIRED NOW (9 новых exact declarations)

Все — в `apps/web` (`dependencies`/`devDependencies`). Root `package.json` не меняется; root `package-lock.json` файл не меняется (см. § 12). Внутренняя зависимость `@max-smart-city/contracts@0.0.0` уже существует (не новая).

### dependencies

| Пакет | Exact | Type | Причина | Проверено registry |
|---|---:|---|---|---|
| `react` | `19.3.0` | dependency | React runtime Mini App | version/engines 2026-09-23 |
| `react-dom` | `19.3.0` | dependency | DOM renderer | version 2026-09-23 |
| `react-router-dom` | `7.18.4` | dependency | approved React Router browser integration (peer react/react-dom >=18; react 19.3.0 OK) | version/peerDependencies 2026-09-23 |
| `@tanstack/react-query` | `5.103.2` | dependency | server-state baseline (peer react ^18\|\|^19) | version/peerDependencies 2026-09-23 |

### devDependencies

| Пакет | Exact | Type | Причина | Проверено registry |
|---|---:|---|---|---|
| `vite` | `8.3.0` | devDependency | workspace-local web build; identичен root Vite 8.3.0 (Vitest 5.0.1 peer `^6.4.0\|\|^7.0.0\|\|^8.0.0`), единая версия без форков | version/engines/peerDependencies 2026-09-23 |
| `@vitejs/plugin-react` | `6.1.1` | devDependency | React transform для Vite 8 (peer `vite ^8.0.0`; optional peers не требуются) | version/peerDependencies/peerDependenciesMeta 2026-09-23 |
| `@types/react` | `19.3.0` | devDependency | React TS declarations (matches react 19) | version 2026-09-23 |
| `@types/react-dom` | `19.3.0` | devDependency | React DOM TS declarations | version 2026-09-23 |
| `happy-dom` | `20.14.5` | devDependency | DOM env для Vitest component/router/viewport тестов (engines node >=20; не-нативный, без download) | version/engines 2026-09-23 |

**DEPENDENCIES_REQUIRED_NOW = 9.** Никаких `^`, `~`, `latest`, `*`. Пост-merge resolved versions совпадают с pinned (проверяется в § 20). Npm dedupe: `vite@8.3.0` hoists к единственному root copy.

## 10. Node / npm / Module Baseline (наследуется от TG-001, не изменяется)

- Node `24.21.0` LTS, npm `11.19.0`, `npm@11.19.0` (root engines), `.npmrc` frozen (`engine-strict=true`, `package-lock=true`, `save-exact=true`).
- ESM only; `type:module`.
- `apps/web/tsconfig.json` наследует `tsconfig.base.json` frozen: `target ES2023`, `strict=true`, `noUncheckedIndexedAccess=true`, `exactOptionalPropertyTypes=true`, `useUnknownInCatchVariables=true`, `noImplicitOverride=true`, `forceConsistentCasingInFileNames=true`, `isolatedModules=true`, `verbatimModuleSyntax=true`, `moduleDetection=force`, `skipLibCheck=false`, `noEmitOnError=true`, `types=[]`.
- `apps/web` compiler: `module=ESNext`, `moduleResolution=Bundler`, `lib=[ES2023,DOM,DOM.Iterable]`, `jsx=react-jsx`, `rootDir=src`, `outDir=dist`, `declaration=false`, `sourceMap=true`. Изменяется только `include` на `["src"]`.
- Import boundaries: cross-workspace импорты только по exact package names; никаких relative-import'ов в `packages/*`, `apps/api`, `apps/db`; веб не импортирует DB/domain.

## 11. Target File Semantics (детерминированные инструкции)

### 11.1. `apps/web/index.html`
`lang="ru"`, `charset=UTF-8`, обязательный `<meta name="viewport" content="width=device-width, initial-scale=1.0">`, `<title>MAX Smart City</title>`, `<div id="root"></div>`, `<script type="module" src="/src/main.tsx"></script>`. No inline scripts/styles, no external assets, no CDN.

### 11.2. `apps/web/vite.config.ts`
Один файл, `/// <reference types="vitest/config" />`, `import { defineConfig } from 'vite'`, `import react from '@vitejs/plugin-react'`. `plugins: [react()]`, `base: '/'`, `build.outDir: 'dist'`, `test: { environment: 'happy-dom', include: ['src/**/*.test.{ts,tsx}'], globals: false }`. Без aliases, без external, без assets встраивания.

### 11.3. `apps/web/src/main.tsx`
`StrictMode`, `AppProviders`, `RouterProvider router={createAppRouter()}`; `import './styles/base.css'`; `const rootElement = document.getElementById('root'); if (!rootElement) throw new Error('ROOT_MISSING');` `createRoot(rootElement).render(...)`. Никакого другого side effect, никакой логики приложения.

### 11.4. `apps/web/src/app/query-client.ts`
```ts
export const QUERY_CLIENT_OPTIONS = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
} as const;
export function createQueryClient(): QueryClient { return new QueryClient(QUERY_CLIENT_OPTIONS); }
export const queryClient: QueryClient = createQueryClient();
```
Обоснование pinned: `retry:false` для queries и mutations — никакой скрытый авто-retry бизнес-мутаций (ADR-014/025, Product Spec § 22.11; 409 → refetch + сообщение, не silent retry); `refetchOnWindowFocus:true` — focus-refresh (Architecture § 8.4); `staleTime:30_000` — умеренный refetch; `gcTime:300_000` — кэш живёт после перехода. Поздний актор-switch и command-refetch выполняются через `invalidateQueries` в feature-задачах (TG-020+).

### 11.5. `apps/web/src/app/routes.tsx` (route contribution seam)
```tsx
export interface AppRouteModule { readonly id: string; readonly routes: RouteObject[]; }
export function buildAppRoutes(modules: readonly AppRouteModule[] = []): RouteObject[]
```
Возвращает: root layout route `{ path:'/', element:<AppShell/>, children:[ { index:true, element:<HomeRoute/> }, ...flatten(modules) ] }` и catch-all `{ path:'*', element:<ErrorState message="Маршрут не найден" /> }`. `HomeRoute` = `<section data-testid="home-placeholder" aria-label="Главная" />` (без продуктого контента). Чистая функция, без React state.

### 11.6. `apps/web/src/app/router.tsx` (central router — owner TG-004 до TG-029)
```tsx
export function createAppRouter(modules: readonly AppRouteModule[] = []): ReturnType<typeof createBrowserRouter> {
  return createBrowserRouter(buildAppRoutes(modules));
}
```
Feature-задачи НЕ редактируют этот файл; TG-029 единственный заменит/дополнит registry.

### 11.7. `apps/web/src/app/app-providers.tsx`
`PlatformProvider` → `QueryClientProvider client={queryClient}` → `children`. Экспорт `AppProviders`. По умолчанию не вызывает сетевых запросов.

### 11.8. `apps/web/src/platform/platform-adapter.ts`
Интерфейс (boundary, не реализация MAX):
```ts
export interface PlatformAdapter {
  readonly name: 'browser' | 'max' | 'test';
  readonly isMiniAppContext: boolean;
  getRawInitData(): string | null;          // ТОЛЬКО raw строка для server validation (TG-010/TG-020); никогда не интерпретируется здесь
  subscribeForeground(listener: () => void): () => void; // focus/visibilitychange
}
export function createPlatformAdapter(): PlatformAdapter; // default browser adapter, side-effect-free до вызова subscribeForeground, name='browser', no MAX global read
```
Запрещено: читать/доверять `initDataUnsafe`, читать role/actor/`startapp`, обращаться к DOM-глобалам обладателя (`window.Telegram`/`window.MAX`) в TG-004.

### 11.9. `apps/web/src/platform/platform-context.tsx`
`PlatformContext` с дефолтом `createPlatformAdapter()`; `PlatformProvider({ adapter, children })`; `usePlatform(): PlatformAdapter`. Никакой бизнес-логики; используется feature-задачами.

### 11.10. `apps/web/src/shell/app-shell.tsx`
`<div class="app-shell">` + `<header class="app-shell__header">` (статический заголовок) + `<main class="app-shell__main"><Outlet/></main>`. Никаких role swith, навигации-заглушек, product menu.

### 11.11. `apps/web/src/components/ui/*`
- `pending-state.tsx`: `PendingState({ label? })` → `role="status"`, `aria-live="polite"`, только визуальный pending, не меняет state.
- `success-state.tsx`: `SuccessState({ message })` → `role="status"`.
- `error-state.tsx`: `ErrorState({ message?, onRetry? })` → `role="alert"`, опциональный retry.
Строгие типы (exactOptionalPropertyTypes): опциональные props не передаются как `= undefined`.

### 11.12. `apps/web/src/styles/base.css`
Pinned правила: `*{box-sizing:border-box}`, `html,body,#root{margin:0;min-height:100dvh}` (проверка факта 100dvh), `body` системная font stack (`system-ui, -apple-system, Segoe UI, Roboto, sans-serif`), `.app-shell{max-width:640px;margin:0 auto;padding:0 16px}`, `@media (min-width:768px){.app-shell{max-width:880px}}`, `@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important}}`. Никаких фреймворков/CDN/fonts/иконок. `.app-shell__header/.app-shell__main` — только layout.

### 11.13. `apps/web/src/app/test-render.tsx`
Харнесс: `renderReactTree(ui, { adapter? })` → `createRoot(container).render(<AppProviders>{ui}</AppProviders>)` в `act`; cleanup `unmount()`. Только для тестов (`src/app/test-render.tsx` не импортирует `main.tsx`).

### 11.14. Тесты (имена fullName обязаны содержать `TG-004`)
| Файл | Проверяет |
|---|---|
| `main.test.tsx` | React bootstrap smoke: `<AppProviders><RouterProvider router={createMemoryRouter(buildAppRoutes())}/></AppProviders>` рендерит `home-placeholder`, без throw |
| `router.test.tsx` | Router smoke: `buildAppRoutes([{id:'x',routes:[...]}])` + memory router; home placeholder; добаление module route |
| `routes.test.tsx` | Route seam: catch-all рендерит `ErrorState` на неизвестный URL; module routes flatten; `AppRouteModule` type-контракт |
| `query-client.test.ts` | Policy unit: `QUERY_CLIENT_OPTIONS` exact (staleTime/gcTime/retry/refetchOnWindowFocus/refetchOnReconnect/mutations.retry); `createQueryClient()` → QueryClient c теми же options; singleton `queryClient` |
| `viewport.test.tsx` | Viewport: установка ширины ТОЛЬКО через `Object.defineProperty(window, 'innerWidth', { value, configurable: true })` (375 и 1024) ДО render — без прямого присвоения readonly `window.innerWidth`; рендер shell без throw; наличие `#root` container |
| `platform-adapter.test.ts` | `createPlatformAdapter()`: name='browser', isMiniAppContext=false, getRawInitData()===null, subscribeForeground возвращает unsub; отсутствие доверия MAX gobal |
| `app-shell.test.tsx` | Shell рендерит header + outlet container |

### 11.15. `apps/web/src/vite-env.d.ts`
Ровно одна строка (без комментариев и пустых строк):
```ts
/// <reference types="vite/client" />
```
Обязателен для AC-004: `main.tsx` импортирует `./styles/base.css`, а `tsconfig.base.json` заморожен с `types: []` и не включает `vite/client` автоматически — без этого файла `npm run typecheck` детерминированно падает с TS2307. Triple-slash в `main.tsx` не используется (единообразие: все типы Vite — одним файлом из § 7).

## 12. Root Lockfile Governance — explicit (обязательно)

1. Root `package.json`, root `package-lock.json`, `tsconfig.base.json`, `.npmrc`, `.gitignore` — замороженная shared surface (TG-001 owner; Task Graph § 7; TG-001 § 11/12).
2. TG-004 **не редактирует** root `package.json` и **не коммитит** изменения root `package-lock.json`. Единственный manifest edit TG-004 — `apps/web/package.json` (§ 7).
3. Требование новых dependencies фиксируется самим изменённым `apps/web/package.json` (merged manifest = authoritative request). Отдельный файл запроса не требуется и не создаётся (`tasks/**` запрещён).
4. Локальная верификация lockfile — disposable и строго упорядочена (§ 16): scope/write-set pre-check (§ 16.2) выполняется **ДО** регенерации; затем агент выполняет `npm install --package-lock-only --ignore-scripts` (имеет право перегенерировать локальный lockfile в checkout) и `npm ci`, **сразу после dependency verification** возвращает root lockfile к BASE_SHA (`git restore -- package-lock.json`, § 16.3) и доказывает `git diff --exit-code 200b117... -- package-lock.json` == пусто; финальный идемпотентный proof выполняется в § 16.8, до staging (§ 16.9).
5. Параллельные Wave-1 ветки (TG-002/003/004/005) не конкурируют за lockfile: ни одна из них не коммитит его.
6. **Checkpoint lockfile verification (Integration Agent, IC-1):** после merge всех четырёх веток Integration Agent единственный выполняет каноническую перегенерацию `npm install --package-lock-only --ignore-scripts` + `npm ci`, проверяет resolved версии девяти TG-004 deps равны pinned, затем прогоняет полный IC-1 (build/typecheck/test всех 5 workspaces) и создаёт stable `main`.
7. На коммиченном состоянии branch `codex/tg-004-web-skeleton` `npm ci` без локальной перегенерации не гарантирован (stale lockfile) — это намеренно и документировано `LOCKFILE_MERGE_PENDING`, НЕ является багом TG-004 и не лечится коммитом lockfile.
8. **ROOT_LOCKFILE_TASK_OWNED = NO**: root `package-lock.json` не принадлежит TG-004 (frozen surface TG-001, Task Graph § 7). Контракт лишь выполняет disposable локальную регенерацию для верификации и всегда восстанавливает файл к BASE_SHA до любых diff/staging-проверок; коммит lockfile запрещён (§ 8, AC-013).

## 13. Parallel Safety / Collision Model

- **FILES_EXCLUSIVELY_OWNED (TG-004):** § 7 ровно 27 paths — все внутри `apps/web`; плюс `apps/web/src/features/**` НЕ создаётся (зарезервировано за TG-020–TG-025).
- **SHARED_FILES_IF_ANY:** 0. Root frozen поверхность не редактируется. `packages/contracts/**` (TG-002), `apps/api/**` (TG-003), `packages/db/**` (TG-005) не трогаются.
- **SHARED (read-only consumption):** `@max-smart-city/contracts` dist — потребляется только по package name; product schema symbols не импортируются до TG-002. `apps/web` rebuild не конфликтует.
- **COLLISION_RISK:** нет пересекающихся write paths. Теоретический риск — TG-002 меняет exported surface contracts dist, что влияет на типизацию web; TG-004 не импортирует его product symbols → риск снят.
- **COLLISION_PROTOCOL:** любое обнаруженное пересечение/изменение чужих файлов на своём branch → STOP + `SCOPE_VIOLATION`; ветку изолировать, вояжения не перебазировать без оркестратора; финальная регистрация маршрутов — только TG-029 (не TG-004 branch).

## 14. Build Semantics

- `apps/web` scripts: `build = "vite build"`, `typecheck = "tsc -p tsconfig.json --noEmit"`, `test = "vitest run"`.
- Root `npm run build` → `npm run build --workspaces` → порядок workspaces из root manifest (contracts → domain → db → api → web). Web build: `vite build` → `apps/web/dist/` c `index.html` + `assets/*` (имена хеш-файлов не фиксируются; их наличие проверяется).
- Root `npm run typecheck` проходит по всем workspaces (TS верна только после root build, создающего `dist` shared packages).
- Root `npm test` → web запускает `vitest run` (rollup конфиг берётся из `apps/web/vite.config.ts`); тесты других workspaces неизменны.
- No «start/dev/serve» scripts в TG-004; runtime-процесс web — поздний ownership (TG-029/TG-030).

## 15. Acceptance Criteria (обязательные)

- **AC-001 — Scope.** Diff относительно `BASE_SHA` = ровно 27 paths § 7 (2 modify, 2 delete, 23 create).
- **AC-002 — Root frozen.** Root `package.json`, `package-lock.json`, `tsconfig.base.json`, `.npmrc`, `.gitignore`, все `docs/**`, `tasks/**`, `AGENTS.md` без изменений.
- **AC-003 — Dependencies exact.** Все 9 новых direct declarations в `apps/web` exact-pinned; в lockfile (локальном, после перегенерации) и в `npm ls` resolved версии равны pinned.
- **AC-004 — Typecheck.** Root `npm run typecheck` exit 0 (после root build). `apps/web` TSC strict профиль без ошибок.
- **AC-005 — Web build.** Root `npm run build` exit 0; `apps/web/dist/index.html` и `apps/web/dist/assets/**/*.js` существуют; shared packages dist built.
- **AC-006 — TG-004 tests.** `test:web` (см. § 16.5) — все тесты green, ≥ 7 prescribed tests c fullName `TG-004`; zero failures; no false/`expect(true)`.
- **AC-007 — React bootstrap.** `main.test.tsx` proves tree рендерит `home-placeholder`; **нет** role-specific builds (один entry, один shell).
- **AC-008 — Router foundation.** `router.test.tsx`/`routes.test.tsx` prove центральный router (sleeve + Outlet + seam `AppRouteModule`), catch-all `ErrorState`.
- **AC-009 — QueryClient foundation.** `query-client.test.ts` proves pinned policy; singleton `queryClient`.
- **AC-010 — No product workflow.** В `apps/web/src/**` нет Case/state/role/actor/DemoRun/`initDataUnsafe`/backend-call/optimistic state transitions; нет WebSocket/SSE/`EventSource`; нет client workflow store (Redux/Zustand/…).
- **AC-011 — No backend/DB/MAX/E2E.** Diff не касается `apps/api`, `packages/db`, `packages/domain`, `packages/contracts`; нет `await fetch(...)` в src; нет Playwright/tests/e2e файлов; нет `._e2e_` etc.
- **AC-012 — Responsive viewport baseline.** `index.html` содержит viewport meta; `base.css` содержит `@media (min-width:768px)` и `100dvh`; `viewport.test.tsx` green; `html lang="ru"`.
- **AC-013 — Lockfile governance.** Перед commit: `git diff --exit-code BASE_SHA -- package-lock.json` пусто; `LOCKFILE_MERGE_PENDING` зафиксирован в отчёте.
- **AC-014 — No secrets.** Нет `.env*`, credentials, tokens в diff.
- **AC-015 — Git hygiene.** Один `IMPLEMENTATION_COMMIT_SHA`; branch push; local==remote; worktree clean; без co-author/`Generated-by`.

## 16. Verification Commands (PowerShell 7.x, fail-closed, исполнитель)

Начало сессии:

```powershell
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
```

### 16.1 Baseline
```powershell
git status --short
git branch --show-current
git rev-parse HEAD
git remote get-url origin
$repoRoot = (git rev-parse --show-toplevel).Trim().Replace('\','/')
if ($repoRoot -eq 'C:/') { throw 'WRONG_REPOSITORY_ROOT' }
if ((git rev-parse HEAD).Trim() -ne '200b117bd58f7080c15fba1cfa556d386a085c99') { throw 'BASELINE_MISMATCH' }
if (git status --short) { throw 'BASELINE_MISMATCH: not clean' }
if ((git branch --show-current).Trim() -ne 'codex/tg-004-web-skeleton') { throw 'TASK_BRANCH_REQUIRED' }
if ((node --version).Trim() -ne 'v24.21.0') { throw 'NODE_NPM_BASELINE_MISMATCH' }
if ((npm --version).Trim() -ne '11.19.0') { throw 'NODE_NPM_BASELINE_MISMATCH' }
```

### 16.2 Scope / write-set pre-check (до disposable lockfile регенерации)
Scope pre-check выполняется строго ДО регенерации disposable lockfile (§ 16.3): иначе наблюдаемый diff может содержать временные lockfile-артефакты и дать ложный `WRITE_SCOPE_VIOLATION`.
```powershell
$allowed = @('apps/web/package.json','apps/web/tsconfig.json','apps/web/src/index.ts','apps/web/src/index.test.ts','apps/web/index.html','apps/web/vite.config.ts','apps/web/src/main.tsx','apps/web/src/app/query-client.ts','apps/web/src/app/app-providers.tsx','apps/web/src/app/router.tsx','apps/web/src/app/routes.tsx','apps/web/src/app/test-render.tsx','apps/web/src/app/router.test.tsx','apps/web/src/app/routes.test.tsx','apps/web/src/app/query-client.test.ts','apps/web/src/app/viewport.test.tsx','apps/web/src/main.test.tsx','apps/web/src/platform/platform-adapter.ts','apps/web/src/platform/platform-context.tsx','apps/web/src/platform/platform-adapter.test.ts','apps/web/src/shell/app-shell.tsx','apps/web/src/shell/app-shell.test.tsx','apps/web/src/components/ui/pending-state.tsx','apps/web/src/components/ui/success-state.tsx','apps/web/src/components/ui/error-state.tsx','apps/web/src/styles/base.css','apps/web/src/vite-env.d.ts')
$changed = @(git diff --name-only '200b117bd58f7080c15fba1cfa556d386a085c99' --)
$untracked = @(git ls-files --others --exclude-standard)
$observed = @($changed + $untracked | Sort-Object -Unique)
$outside = @($observed | Where-Object { $_ -notin $allowed })
if ($outside.Count -ne 0) { throw ('WRITE_SCOPE_VIOLATION: ' + ($outside -join ', ')) }
```
(при count intentionally равен 27 paths на финальном diff).

### 16.3 Dependency + lockfile (disposable regen → verification → restore)
`ROOT_LOCKFILE_TASK_OWNED = NO` (§ 12.8): disposable регенерация нужна только для dependency verification; сразу после верификации lockfile восстанавливается к BASE_SHA — до финального diff (§ 16.8) и staging (§ 16.9).
```powershell
npm install --package-lock-only --ignore-scripts
$lockBefore = (Get-FileHash -Algorithm SHA256 package-lock.json).Hash
npm ci
$lockAfter = (Get-FileHash -Algorithm SHA256 package-lock.json).Hash
if ($lockBefore -ne $lockAfter) { throw 'LOCKFILE_CHANGED_DURING_NPM_CI' }
npm ls react react-dom react-router-dom @tanstack/react-query vite @vitejs/plugin-react @types/react @types/react-dom happy-dom
git restore -- package-lock.json
git diff --exit-code '200b117bd58f7080c15fba1cfa556d386a085c99' -- package-lock.json | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'LOCKFILE_NOT_RESTORED_AFTER_DEPENDENCY_VERIFICATION' }
Write-Output 'LOCKFILE_RESTORED_AFTER_DEPENDENCY_VERIFICATION'
```

### 16.4 Typecheck / build
```powershell
npm run build
npm run typecheck
```

### 16.5 Test (root + web)
```powershell
npm test
Push-Location 'apps/web'
npm exec -- vitest run --reporter=json --outputFile=../../test-results/tg004-vitest.json
Pop-Location
$tj = Get-Content -Raw 'test-results/tg004-vitest.json' | ConvertFrom-Json
if ($tj.numTotalTests -lt 7 -or $tj.numPassedTests -ne $tj.numTotalTests -or $tj.numFailedTests -ne 0) { throw 'TG004_TEST_RESULT_MISMATCH' }
$names = @($tj.testResults.assertionResults | ForEach-Object { $_.fullName })
$missing = @($names | Where-Object { $_ -notmatch 'TG-004' })
if ($missing.Count -ne 0) { throw 'TG004_TEST_NAME_MISMATCH' }
```

### 16.6 Dependency exactness
```powershell
node --input-type=module -e "import fs from 'node:fs'; const p=JSON.parse(fs.readFileSync('apps/web/package.json','utf8')); const exp={dependencies:{'@max-smart-city/contracts':'0.0.0',react:'19.3.0','react-dom':'19.3.0','react-router-dom':'7.18.4','@tanstack/react-query':'5.103.2'},devDependencies:{vite:'8.3.0','@vitejs/plugin-react':'6.1.1','@types/react':'19.3.0','@types/react-dom':'19.3.0','happy-dom':'20.14.5'}}; const norm=x=>Object.fromEntries(Object.entries(x??{}).sort()); const s=JSON.stringify; if(s(norm(p.dependencies))!==s(norm(exp.dependencies))||s(norm(p.devDependencies))!==s(norm(exp.devDependencies))) throw new Error('WEB_DEPENDENCY_SET_MISMATCH');"
node --input-type=module -e "import fs from 'node:fs'; for(const k of ['dependencies','devDependencies']) for(const [n,v] of Object.entries((JSON.parse(fs.readFileSync('apps/web/package.json','utf8'))[k]??{}))){ if(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v)) continue; if(k==='dependencies'&&n==='@max-smart-city/contracts'&&v==='0.0.0') continue; throw new Error('NON_EXACT_VERSION: '+n+'='+v);}"
```

### 16.7 Negative / scope leakage
```powershell
$scan = @(Get-ChildItem -LiteralPath $repoRoot -Recurse -Force -File | ForEach-Object { [IO.Path]::GetRelativePath($repoRoot, $_.FullName).Replace('\','/') } | Where-Object { $_ -notmatch '(^|/)(\.git|node_modules|dist)(/|$)' })
if (@($scan | Where-Object { $_ -like 'apps/web/src/features/*' }).Count -ne 0) { throw 'FEATURES_SCOPE_LEAK' }
if (Test-Path apps/api) { if (@(git diff --name-only '200b117bd58f7080c15fba1cfa556d386a085c99' -- apps/api).Count -ne 0) { throw 'API_SCOPE_LEAK' } }
if (@(git diff --name-only '200b117bd58f7080c15fba1cfa556d386a085c99' -- packages/contracts packages/db packages/domain).Count -ne 0) { throw 'PKG_SCOPE_LEAK' }
if (@(git diff --name-only '200b117bd58f7080c15fba1cfa556d386a085c99' -- package.json tsconfig.base.json .npmrc .gitignore).Count -ne 0) { throw 'ROOT_FROZEN_LEAK' }
$srcScan = @(Get-ChildItem 'apps/web/src' -Recurse -File | ForEach-Object { $_.FullName })
$bad = @(Select-String -Path $srcScan -Pattern 'initDataUnsafe|WebSocket|EventSource|fetch\(|axios|zustand|redux|@tanstack/query-core|localStorage\.setItem|sessionStorage' -List 2>$null | ForEach-Object { $_.ToString() })
if ($bad.Count -ne 0) { throw ('FORBIDDEN_SOURCE_PATTERN: ' + ($bad -join '; ')) }
if (Test-Path tests/e2e) { throw 'E2E_SCOPE_LEAK' }
$locks = @($scan | Where-Object { [IO.Path]::GetFileName($_) -eq 'package-lock.json' })
if ($locks.Count -ne 1) { throw 'LOCKFILE_COUNT_MISMATCH' }
```

### 16.8 Lockfile final proof + final diff
Lockfile уже восстановлен сразу после dependency verification (§ 16.3); повторный `git restore -- package-lock.json` идемпотентен и остаётся финальным proof перед staging (§ 16.9).
```powershell
git restore -- package-lock.json
git diff --exit-code '200b117bd58f7080c15fba1cfa556d386a085c99' -- package-lock.json | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'LOCKFILE_NOT_RESTORED' }
Write-Output 'LOCKFILE_RESTORED'
git diff --check
git diff --stat '200b117bd58f7080c15fba1cfa556d386a085c99'
git diff '200b117bd58f7080c15fba1cfa556d386a085c99' -- apps/web
```

### 16.9 Staged validation
```powershell
git add -- apps/web/package.json apps/web/tsconfig.json apps/web/src/index.ts apps/web/src/index.test.ts apps/web/index.html apps/web/vite.config.ts apps/web/src/main.tsx apps/web/src/app/query-client.ts apps/web/src/app/app-providers.tsx apps/web/src/app/router.tsx apps/web/src/app/routes.tsx apps/web/src/app/test-render.tsx apps/web/src/app/router.test.tsx apps/web/src/app/routes.test.tsx apps/web/src/app/query-client.test.ts apps/web/src/app/viewport.test.tsx apps/web/src/main.test.tsx apps/web/src/platform/platform-adapter.ts apps/web/src/platform/platform-context.tsx apps/web/src/platform/platform-adapter.test.ts apps/web/src/shell/app-shell.tsx apps/web/src/shell/app-shell.test.tsx apps/web/src/components/ui/pending-state.tsx apps/web/src/components/ui/success-state.tsx apps/web/src/components/ui/error-state.tsx apps/web/src/styles/base.css apps/web/src/vite-env.d.ts
```
`git add -- <path-to-deleted>` — у Windows удаление фиксируется `git add -A -- apps/web/src/index.ts apps/web/src/index.test.ts` (исполнитель обязан включить удаления через `git status --short`).

```powershell
$staged = @(git diff --cached --name-only '200b117bd58f7080c15fba1cfa556d386a085c99' --)
$outsideStaged = @($staged | Where-Object { $_ -notin $allowed })
if ($outsideStaged.Count -ne 0) { throw ('STAGED_SCOPE_VIOLATION: ' + ($outsideStaged -join ', ')) }
if (@(Compare-Object ($allowed | Sort-Object) ($staged | Sort-Object)).Count -ne 0) { throw 'STAGED_FILE_SET_MISMATCH' }
$rem = @(git ls-files --others --exclude-standard)
if ($rem.Count -ne 0) { throw ('UNSTAGED_UNTRACKED_FILES: ' + ($rem -join ', ')) }
git diff --exit-code --
git diff --cached --check
git diff --cached --stat
git diff --cached
```

### 16.10 Baseline re-check before commit
```powershell
if ((git rev-parse HEAD).Trim() -ne '200b117bd58f7080c15fba1cfa556d386a085c99') { throw 'BASELINE_CHANGED_BEFORE_COMMIT' }
```

## 17. Negative Checks (для reviewer)

- 9 деп-заявок только в `apps/web`; no range tokens; deferred inventory (fastify/pino/zod/kysely/pg/@types/pg/@playwright/test) в TG-004 отсутствует; Playwright в lockfile нет.
- `apps/web/src/index.ts` и `index.test.ts` удалены; нет «двойных» entry.
- `initDataUnsafe` нет в `apps/web/src`; нет `window.Telegram`/`window.MAX` доверия.
- Нет `fetch`, `axios`, WebSocket/SSE, local/sessionStorage, Redux/Zustand, Tailwind, @testing-library, jsdom.
- Нет прямого присвоения readonly `window.innerWidth` в тестах — только `Object.defineProperty(window, 'innerWidth', { value, configurable: true })` ДО render (§ 11.14).
- Нет `apps/web/src/features/**`; нет E2E/Playwright; нет `.env*`; нет Docker/OpenAPI.
- Нет изменений root frozen поверхность и canonical docs.
- В тестах нет `expect(true).toBe(true)`, нет `passWithNoTests`, нет dummy assertions.

## 18. Escalation Triggers (блокер)

- Несоответствие `BASE_SHA` или dirty worktree → `BASELINE_MISMATCH` (не чинить forcibly).
- Требование изменить Product Freeze/Spec/Architecture/Data Model/Interface Contracts/Task Graph или root frozen surface → `SPEC_CONFLICT` / `SPEC_OR_ARCHITECTURE_GAP` с exact section (Task Graph § 13).
- Необходимость написта за whitelist § 7 → `SCOPE_VIOLATION`.
- Конфликт с параллельными TG-002/003/005 файлами → `COLLISION_CONFLICT`, остановка, инфome оркестратора.
- `npm ci`/build/typecheck/test failure, не устранимый в пределах scope → STOP, не расширять scope.
- Отсутствие human Git identity → `HUMAN_GIT_IDENTITY_REQUIRED`.

## 19. Commit / Push Protocol

1. Staged проверки § 16.9; human identity проверяется read-only:
```powershell
$PSNativeCommandUseErrorActionPreference = $false
$un = git config --get user.name; $ue = $LASTEXITCODE
$em = git config --get user.email; $ee = $LASTEXITCODE
$PSNativeCommandUseErrorActionPreference = $true
if ($ue -ne 0 -or $ee -ne 0 -or [string]::IsNullOrWhiteSpace(($un | Out-String)) -or [string]::IsNullOrWhiteSpace(($em | Out-String))) { Write-Output 'HUMAN_GIT_IDENTITY_REQUIRED'; throw 'HUMAN_GIT_IDENTITY_REQUIRED' }
```
2. Git config не менять; без `--author`; без co-author/`Generated-by`.
3. Commit subject: `feat(web): establish Mini App shell foundation`.
4. `git commit -m "feat(web): establish Mini App shell foundation"`; non-zero → stop.
5. `git push origin codex/tg-004-web-skeleton` (без `-u`); без `main`/force.
6. `git fetch origin codex/tg-004-web-skeleton`; затем:
```powershell
$local = (git rev-parse HEAD).Trim(); $remote = (git rev-parse origin/codex/tg-004-web-skeleton).Trim()
if ($local -ne $remote) { throw 'IMPLEMENTATION_REMOTE_SHA_MISMATCH' }
if (git status --short) { throw 'POST_PUSH_WORKTREE_NOT_CLEAN' }
Write-Output "IMPLEMENTATION_COMMIT_SHA: $local"
```
7. `IMPLEMENTATION_COMMIT_SHA` **НЕ** является stable checkpoint; stable `main` создаёт Integration Agent (IC-1) после merge/push.

## 20. Definition of Done

- Контракт использован без отклонений; diff ровно 27 paths; все machine-checkable AC-001…AC-015 по свежему выводу команд; semantic AC-010/AC-011/AC-014 подтверждены полным human-read diff (не только keyword scan).
- Тип: `frontend`; dependencies exact (9 новых); `vite build` работает; TSC strict clean; 7+ TG-004-тестов green.
- Нет product/API/DB/MAX/E2E; нет optimistic/workflow store; root frozen поверхность + lockfile restored.
- `LOCKFILE_MERGE_PENDING` зафиксирован; human identity подтверждена; commit/push выполнены; local==remote; `IMPLEMENTATION_COMMIT_SHA` возвращён; статус `IC-1 READY` (для TG-004 части).
- Не push'ed `main`, не создан stable checkpoint самостоятельно.

Stable checkpoint (IC-1) создаёт отдельный Integration Agent (Task Graph § 1, 9): независимая проверка, merge TG-002–TG-005, каноническая перегенерация lockfile, полный IC-1 checkpoint, возврат stable `main` SHA.

## 21. Traceability

| Canonical source | Contract clause | AC / verification |
|---|---|---|
| Task Graph TG-004 Goal/Outputs | § 4, 11 | AC-005…AC-012; § 16 |
| Task Graph § 3 «central router до TG-029» | § 5, 11.6 | AC-008 |
| Architecture § 8.3–8.5 / ADR-025 | § 5, 11.4 | AC-009; query-client.test.ts |
| Product Spec § 22.11 / ADR-014 | § 11.4 | query-client.test.ts (retry:false) |
| Architecture § 8.1 одна Mini App | § 5 | AC-007 (single entry) |
| TG-001 deferred inventory / governance | §§ 9, 12 | AC-003, AC-013 |
| Task Graph § 7 collision policy | § 13 | AC-001…AC-002 |
| AGENTS / TASK_TEMPLATE | §§ 6, 19–20 | AC-015; § 16/fail-closed |
| IC-0 Workspace PASS → Wave-1 BASE | §§ 1, 6 | Baseline checks |

## 22. Dependency / Decision Leakage Check

| Вопрос | Pinned answer | Choice remains? |
|---|---|---|
| Platform/Framework | React 19 + Vite 8 (workspace-local) | NO |
| Routing | react-router-dom 7 (browser), seam + createBrowserRouter; memory router только в тестах | NO |
| Server state | @tanstack/react-query 5; policy constants exact | NO |
| Entry | index.html → /src/main.tsx | NO |
| Vite config | single vite.config.ts, react plugin, base '/', happy-dom test env | NO |
| Test env | happy-dom (nexternal dep) | NO |
| Central router | router.tsx; TG-029 edits later | NO |
| MAX seam | PlatformAdapter boundary; только raw initData string | NO |
| Dependencies | 9 exact versions (доказаны npm registry) | NO |
| Build output | vite build → apps/web/dist | NO |
| Lockfile | local disposable; commit excluded; Integration Agent canonical | NO |

**IMPLEMENTATION_CHOICES_REMAINING = 0.**

## 23. Self-Status

```text
STATUS = APPROVED / CANONICAL / PASS
CODING = UNBLOCKED AFTER REPOSITORY CLOSURE
```