# TG-013: DemoRun и effective actor

Контракт: `e797423dd0cf20e8ad04e2089d841c335142a477`.
Resume base: `8b864aa1c2e4ed382e5bb4b32e862ded40ba41b0`.

## Composition

`registerDemoModule(app, config, { database })` регистрирует существующие TG-010
auth/bootstrap/session handlers и два маршрута TG-013. В composition root этот
вызов заменяет отдельную регистрацию auth, чтобы избежать дублирования маршрутов.
Application router wiring остаётся за Integration Agent/TG-029; shared-файлы
auth, token, authorization и app не изменяются.

Bootstrap и session read используют одну request transaction. Репозитории и
TG-011 policy читают её через request scope; `currentDemoRun` блокирует real
MaxIdentity/current run до commit согласованного snapshot ответа. Это сериализует
restore со Start.
Decorator сохраняет исходные handlers, schemas и token protocol TG-010.
Ответ handler буферизуется до успешного commit: при ошибке commit bootstrap не
выдаёт token для несохранённой MaxIdentity.

`registerDemoRoutes` доступен отдельно для уже подготовленной composition.
Start/switch используют исключительно `CommandTransactionKernel` TG-012,
`MAX_IDENTITY` principal и canonical fingerprint. Replay проверяет текущие права
входного token, сохранённый run и exact selected binding сохранённого switch token;
сохранённый contractor actor также должен соответствовать текущему разрешению A/B.

Каталог берётся из canonical source entry point TG-008
`packages/db/src/seed/index.ts`. Этот файл должен присутствовать в runtime вместе
с compiled API; Node 24.21.0 исполняет его штатным type stripping. Каталог не
копируется и не пересоздаётся модулем TG-013.

## Seam для TG-014

После TG-012 reservation/authorization в **той же transaction**:

1. Получить server-bound identity/run и проверить выбранного Resident через
   существующие TG-010/TG-011 interfaces.
2. Вызвать `lockDemoIdentity(transaction, maxIdentityId)` до записи нового Case
   и повторно проверить current run/authority под lock.
3. Вставить Case с `demo_run_id` current run, CaseIteration и остальные effects.
4. Вызвать `bindPrimaryCase(transaction, maxIdentityId, runId, caseId)` до commit.

Bind не создаёт Case, не открывает отдельную transaction и не вводит idempotency.
Первый valid Case устанавливает `primary_case_id`; повторный bind того же Case
допустим; другой Case получает `409 DEMO_PRIMARY_CASE_EXISTS`. Исключение должно
откатить всю transaction TG-014, включая Case/events/attachments. Immutability
`Case.demo_run_id` обеспечивается существующим PostgreSQL trigger TG-006.

Порядок блокировок: real MaxIdentity → current DemoRun → primary Case для
switch/restore coordination. `FOR NO KEY UPDATE` избегает конфликта с FK
`KEY SHARE` reservation и новых Case. Обычные Case mutations используют Case lock
TG-012 и не должны брать identity lock в обратном порядке.

Start архивирует только status/timestamp предыдущего run. Case/history не меняются.
Новый run сохраняет explicit `notification_recipient_max_identity_id` exact real
MAX identity; SubmitResult должен загружать её confirmed `delivery_chat_id/type`,
без интерпретации mini-app `user.id` как outbound адреса.

## Проверки

Требуются Node 24.21.0, npm 11.19.0, PostgreSQL 18.x. Перед PG suite собрать
workspaces и migrations через `npm run build`.
Текущий owned-DB harness выделяет отдельные targets и ownership receipts для
`TG013` и `TG013_SEAM`. Нужны `APP_ENV=test`,
`TEST_DATABASE_TARGET=DISPOSABLE_TEST_ONLY` и `TEST_POSTGRES_ADMIN_URL`
выделенного тестового provisioner. Один suffix URL не разрешает DDL: suite
проверяет соответствующий `*_TEST_DATABASE_RECEIPT` до schema/migrations.
Demo suite создаёт случайную schema и удаляет только свою schema после проверок;
runner удаляет только подтверждённые owned targets.

```text
npm ci
npm run build
npm run typecheck
npm run test:owned-db
```

Прямой targeted Vitest запуск требует предварительного owned provisioning и
передачи URL/receipt для обеих TG-013 suites; центральная TG-029 composition для
этих проверок не нужна.

На машине с ограниченной памятью Go-компилятора TypeScript можно установить
`GOMAXPROCS=2` и `GOMEMLIMIT=1536MiB`; это не меняет проверяемые исходники.
