# Docker packaging spike (PREP ONLY)

## PRE-TG030 production output fix

Ветка `codex/docker-production-output-fix` включает исходный spike-коммит
`12ec1a66d34ee30ae234ff531d6ad1a96cf9effa` и актуальный `main`.
Обычный `apps/api/dist` по-прежнему компилирует тесты для разработки.
`npm run build:production --workspace @max-smart-city/api` компилирует только
`src/app/main.ts` и достижимые production-модули в `apps/api/dist-production`.
Runtime stage копирует этот каталог в `/app/apps/api/dist`; test-only файлы,
fixture credentials и fake adapter в нём запрещены структурным тестом.

После `npm ci` и `npm run build` выполнить:

```powershell
npm run build:production --workspace @max-smart-city/api
node --test tests/support/production-package.test.mjs
```

`.dockerignore` исключает тестовые файлы и локальный `dist-production` из
Docker build context. Тест проверяет production output, необходимые web/DB/seed
артефакты, границу Docker COPY и известные синтетические credential markers.
Он не заменяет inspection собранного Linux-образа.

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
