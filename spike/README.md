# Docker packaging spike (PREP ONLY)

## PRE-TG030 production output fix

Ветка `codex/docker-production-output-fix` включает исходный spike-коммит
`12ec1a66d34ee30ae234ff531d6ad1a96cf9effa` и актуальный `main`.
Обычный `apps/api/dist` по-прежнему компилирует тесты для разработки.
`npm run build:production --workspace @max-smart-city/api` компилирует всё
production-дерево `src/**/*.ts` в `apps/api/dist-production`, включая отдельные
auth, DemoRun, authorization, command kernel, MAX/webhook, notification worker,
redrive и recovery CLI. Будущие Case/configuration modules автоматически входят
в это дерево; их отсутствие на candidate не восполняется реализацией TG-029.
Тесты, test fixtures/helpers и typecheck-only modules исключены.
Runtime stage копирует этот каталог в `/app/apps/api/dist`.

TypeScript следует imports даже для excluded roots. Поэтому build-only
`apps/api/scripts/production-boundary.mjs` проверяет точную team-owned MAX seam,
убирает fake export/import и fake adapter output; factory сохраняет live branch
и fail-closed отказывает при `fake`. При drift этой seam сборка падает.
Обычные source/test build и TEST fake adapter остаются доступны.

После `npm ci` и `npm run build` выполнить:

```powershell
npm run build:production --workspace @max-smart-city/api
node --test tests/support/production-package.test.mjs
```

`.dockerignore` исключает тестовые файлы и локальный `dist-production` из
Docker build context. Тест проверяет production output, необходимые web/DB/seed
артефакты, границу Docker COPY и известные синтетические credential markers.
Gate сверяет полный source→output inventory, импортирует все production modules,
проверяет migrations/seed и fail-closed запуск CLI без credentials/внешнего I/O.
Отдельно он создаёт временный runtime-набор с чистым
`npm ci --omit=dev --ignore-scripts --offline`, проверяет lockfile tree, отсутствие dev-only packages,
критические dependency imports и sentinels во всех vendor files. Временный
runtime-набор автоматически удаляется. В build stage gate использует cache от
`npm ci`; install policy совпадает с отдельной Docker dependency stage.
Он не заменяет inspection собранного Linux-образа.

### Published vendor content

Contract adjudication: [TG-030](../tasks/TASK_GRAPH.md) запрещает «не include
working token»; [Testability TG-028 §§6–7, 9](../tasks/TG-028_TASK_CONTRACT.md)
требует «TEST auth и artifacts не попадают в production build» и запрещает
тестовые credentials/actor selector. [Architecture §§20–22, 25–26](../docs/03_ARCHITECTURE.md)
и [Hackathon Criteria §§4, 7–8](../docs/09_HACKATHON_CRITERIA.md) не устанавливают
запрет на каталоги `test/tests` в опубликованных npm dependencies.

`pino@10.3.1/test/**` — vendor package content из pinned npm tarball, а не
скомпилированные тесты команды. Оно сохраняется вместе с main/bin/runtime files.
Gate проверяет integrity tarball по lockfile и побайтовое совпадение **всех**
установленных файлов pino, включая test fixtures; выполняет pino logging smoke.
Vendor test paths не считаются team test output. Проверка team credential
sentinels применяется также к vendor files без исключений по имени каталога.
Локальные fixtures из build context в dependencies не копируются; vendor
packages устанавливаются чистым locked install без lifecycle scripts.

`BUILD_SHA` передаётся при сборке образа как точный 40-символьный SHA commit:

```powershell
$env:BUILD_SHA = git rev-parse HEAD
docker compose -f compose.spike.yaml build app
```

Dockerfile проверяет формат, записывает SHA в image label и default runtime
environment. Compose больше не подставляет фиктивный SHA и требует явного
значения. Для TG-030/TG-032 следует передавать SHA окончательного immutable
commit образа. `HEALTHCHECK` обращается только к `/health/live`; он не является
доказательством `/health/ready` или финальной композиции TG-029.

База: `origin/main` = `6b4a3a3aad2c01c4357c432ad00db89e708cd462`.
Ветка: `codex/docker-packaging-spike`. Это эксперимент для TG-030, а не реализация TG-030 и не доказательство работающей продуктовой вертикали.

## Что подготовлено

- `Dockerfile.spike`: отдельные стадии install/build/runtime на `node:24.21.0-bookworm-slim`; npm закреплён на `11.19.0`; production stage получает только workspace manifests, production `node_modules`, скомпилированные API/DB/domain/contracts, web dist, исходный TG-008 seed CLI и spike-only entrypoint.
- `.dockerignore`: allowlist для build context. `.git`, `.env*`, `node_modules`, `dist`, логи и временные файлы исключены; runtime stage использует явные `COPY`.
- `spike/entrypoint.mjs`: подключает уже существующий Fastify static hook к web dist. Обычный `apps/api/src/app/main.ts` сейчас не передаёт static descriptor.
- `spike/migrate.mjs`: экспериментальный одноразовый вызов существующего Kysely migrator.
- `compose.spike.yaml`: только локальный smoke с фиктивными test-значениями и PostgreSQL на `tmpfs`, без публикации DB-порта и постоянного volume.

## Выполненные проверки

Packaging closure от `a314e74eec676db7e9fb0226129775c6e64a358f` проверена
на Node **24.21.0**, npm **11.19.0**: normal build, typecheck, production build,
структурный gate (45 API modules), production/CLI imports, чистый production
dependency tree без dev-only packages, dependency imports, pino logging/tarball
integrity и sentinel scan — PASS. Source feature modules и TG-029 registry
не изменены. Эти PASS относятся к packaging/import boundary, а не к полному
продуктовому E2E или выполнению migrations/seed на БД.

Дополнительный `npm run test` не прошёл без внешних `TG*_TEST_DATABASE_URL`:
11 PostgreSQL suites отказались запускаться; также был timeout worker test под
параллельной нагрузкой. Отдельный повтор worker suite прошёл **23/23**.
Остальные выполненные tests: contracts **95**, domain **141**, DB unit **20**,
API **639**, web **268** — PASS. DB provisioning не предоставлен.
Docker/Linux runtime данной closure — **NOT_RUN**.

Ниже сохранена история проверок исходного spike:

| Проверка | Результат |
| --- | --- |
| `origin/main` | SHA совпал с удалённым ref. |
| Node/npm | Локально использованы ровно `v24.21.0` и `11.19.0`; тег Linux base image существует в Docker Hub. |
| `npm ci --no-audit --no-fund` | PASS; 153 packages, lockfile не изменился. |
| `npm run build` | PASS для всех пяти workspaces; Vite создал `apps/web/dist/index.html` и JS/CSS assets. |
| `npm prune --omit=dev`, `npm ls --omit=dev --all` | PASS; API, Fastify static, Kysely, pg, Zod и workspace symlinks доступны без dev-зависимостей. |
| Локальный runtime import | PASS для compiled API, `@max-smart-city/db`, `migrateToLatest` и TG-008 seed TypeScript на Node 24.21.0. |
| Миграции после build | `0001_foundation.js`, `0002_case_workflow.js`, `0003_operational_persistence.js` присутствуют в `packages/db/dist/migrations`. |
| Локальный HTTP через spike entrypoint | `/` = 200, JS asset = 200, `/health/live` = 200, `/health/ready` = 503. |
| Compose syntax, JS syntax, `git diff --check` | PASS. |
| Статический поиск ключей и tracked `.env`/temp/log | Совпадений нет. Это не заменяет скан собранного образа. |

## Что не доказано

`docker build -f Dockerfile.spike ...` завершился ошибкой Docker Engine: `500 Internal Server Error` на `dockerDesktopLinuxEngine/_ping`. Docker Desktop остался `stopped`; WSL не установлен. Поэтому production image не создан, PostgreSQL в контейнере не запускался, а содержимое образа, права пользователя `node`, миграции/seed внутри образа, отсутствие секретов внутри образа и фактический SIGTERM в Linux не проверены. Это блокер среды исполнения, а не установленная ошибка Dockerfile.

Текущий canonical `main.ts` запускает `RuntimeLifecycle` с обработчиком SIGTERM и bounded shutdown, но контейнерный сигнал именно для этого entrypoint здесь не воспроизведён. Spike-entrypoint использует тот же lifecycle и добавляет только static descriptor. Default readiness probe всё ещё возвращает `503`; финальный TG-029 registry отсутствует. Результат не следует считать `TG-030 PASS` или работающим приложением.

## Повтор smoke на хосте с Linux Docker Engine

Команды выполнять в spike-ветке; фиктивные значения из `compose.spike.yaml` годятся только для disposable smoke.

```powershell
docker compose -f compose.spike.yaml build app
docker compose -f compose.spike.yaml up -d db
docker compose -f compose.spike.yaml run --rm --no-deps app node spike/migrate.mjs
docker compose -f compose.spike.yaml run --rm --no-deps app node packages/db/src/seed/cli.ts
docker compose -f compose.spike.yaml up -d app
Invoke-WebRequest http://127.0.0.1:33030/
Invoke-WebRequest http://127.0.0.1:33030/health/live
docker compose -f compose.spike.yaml down
```

Затем проверить `docker image inspect max-hackathon:docker-spike` (`Config.User = node`), исполняемые imports/миграции/seed в образе, отсутствие `.git`, `.env*` и временных файлов через `docker run --rm --entrypoint sh`, и остановить контейнер сигналом SIGTERM с проверкой `graceful_shutdown_completed`. Для canonical `main.ts` нужен отдельный запуск `node apps/api/dist/app/main.js` в том же образе: сигнал spike-entrypoint не доказывает поведение canonical entrypoint. База на `tmpfs` исчезает после `down`.
