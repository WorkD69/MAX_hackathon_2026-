# MAX Smart City — «Умный город»

Сервис в MAX ведёт один жилищный случай от обращения жителя через УК и подрядчика до проверки
фактического результата. Приоритетный пользователь — житель квартиры с неаварийной неисправностью
внутридомового отопления / общедомового стояка, для ремонта которой нужен доступ в квартиру.
Сообщение подрядчика о выполнении запускает проверку результата жителем; завершает случай УК.
Замечание и доработка сохраняют тот же `case_id`, результаты и историю.

**Application source of truth:** `332ac4aee174a8743324b82b38853b3a3751d2e9`
(`origin/codex/final-microfix`). Этот application SHA уже развёрнут в production; final smoke
проводит пользователь. Данный пакет добавляет delivery-документы и Docker-конфигурацию поверх него.
Итоговый SHA submission commit фиксируется после проверки и не встраивается в сам commit.
Статусы ещё не выполненных проверок указаны в
[checklist](docs/submission/SUBMISSION_CHECKLIST.md).

## Доступ и фиксированная версия

| Данные сдачи | Значение |
| --- | --- |
| MAX Bot | [max.ru/t793_hakaton_max_bot](https://max.ru/t793_hakaton_max_bot) |
| Mini App HTTPS | [157-22-231-21.sslip.io](https://157-22-231-21.sslip.io/) |
| API base | [157-22-231-21.sslip.io/api/v1](https://157-22-231-21.sslip.io/api/v1) |
| Репозиторий | [MAX_hackathon_2026-](https://github.com/WorkD69/MAX_hackathon_2026-) |
| Production application SHA | `332ac4aee174a8743324b82b38853b3a3751d2e9` |
| Submission commit SHA | Указан в Git tag `submission-final-2026-09-30` после закрытия проверок |
| PDF | [Место для финальной презентации](docs/submission/README.md); файл пока не найден |

Production endpoint `GET /api/v1/system/info` проверяет SHA фактически запущенного образа.
При пересборке из итогового submission commit значение `BUILD_SHA` должно быть равно именно ему;
до такой пересборки production может возвращать application SHA выше. Процедура — в runbook.

## Состав и роль MAX

React + Vite Mini App, Fastify HTTP API на TypeScript, PostgreSQL, Kysely migrations.
Backend отвечает за роли, переходы, exact target IDs, idempotency, role-filtered snapshot и activity.
Фото/файлы хранятся в PostgreSQL (`bytea`), а не в файловой системе контейнера.
Docker содержит `postgres`, one-shot `migrate`, `app`. Notification outbox worker работает внутри
app-процесса; дополнительного worker service нет.
Публичный трафик: `Caddy → 127.0.0.1:APP_PORT → app`; Caddy — существующая VPS-инфраструктура.

MAX обеспечивает запуск Bot → Mini App, signed raw `initData` bootstrap и Bot API уведомление жителя
о новом Result. Session token не заменяет серверную проверку актуальных прав.
Нужны рабочий Bot Token, подключённая Mini App, HTTPS и live web/mobile verification.
Успех fake transport в тестах не доказывает доставку в MAX.

`DEMO_MODE=true` предоставляет ровно четыре role views:

| Role view | Роль в проверке |
| --- | --- |
| `RESIDENT` | Создание Case, проверка Result, подтверждение/замечание |
| `UK_EMPLOYEE` | Приём, выбор/отправка подрядчику, рассмотрение замечаний, завершение |
| `UK_ADMIN` | Конфигурация своей УК и её справочников |
| `CONTRACTOR_EMPLOYEE` | Принятие/отказ Assignment, материал и Result |

Contractor A/B — synthetic actors одной role view; актуального actor выбирает backend.
Реальная MAX identity эксперта отличается от effective synthetic actor. Для synthetic roles нет
логинов/паролей. Войти нужно через MAX; DemoRun изолирован для этой identity.

## Предварительная подготовка и запуск

Нужны Docker Engine с Linux containers и Docker Compose v2, Git, интернет для base images/npm,
рабочий MAX Bot и HTTPS URL. Для host-проверок закреплены **Node 24.21.0, npm 11.19.0**;
root `package-lock.json` используется без обновления зависимостей. В Docker toolchain версии проверяются.

1. Получите чистый checkout submission commit, скопируйте `.env.example` в локальный `.env`.
2. Заполните `MAX_BOT_TOKEN` выданным токеном, `PUBLIC_APP_URL`, `PUBLIC_API_BASE_URL`.
   Для текущего публичного контура значения URL:

   ```dotenv
   PUBLIC_APP_URL=https://157-22-231-21.sslip.io/
   PUBLIC_API_BASE_URL=https://157-22-231-21.sslip.io/api/v1
   ```

   API base должен заканчиваться `/api/v1`; для production адреса HTTPS.
3. Сгенерируйте **разные** случайные hex-значения для `POSTGRES_PASSWORD`, `APP_SESSION_SECRET`,
   `MAX_WEBHOOK_SECRET` и впишите только в локальный `.env`. Каждое значение можно получить:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   `DATABASE_URL` Compose выводит из `POSTGRES_*`; поле в `.env.example` служит для запуска вне Docker.
   Test-only auth keys оставьте пустыми. Не передавайте весь `.env` через `env_file` в приложение.
4. Установите SHA исходников для build. PowerShell:

   ```powershell
   $env:BUILD_SHA = git rev-parse HEAD
   ```

   На Linux:

   ```sh
   export BUILD_SHA="$(git rev-parse HEAD)"
   ```

   Можно сохранить это значение в локальный `.env`. Сборка должна выполняться из чистого checkout.
5. Одна команда для всех локальных компонентов:

   ```sh
   docker compose up --build
   ```

PostgreSQL становится ready → `migrate` применяет versioned migrations → выполняет idempotent
TG-008 seed → app стартует только после exit code 0. Seed добавляет недостающий SYNTHETIC каталог,
сохраняет существующие настройки/Case/DemoRun и не создаёт MAX identity, DemoRun или Case.
При schema/seed conflict migrate завершится с ошибкой, app не запустится: исправление передать владельцу.

Проверка Compose без вывода секретов: `docker compose config --quiet`.
В VPS-профиле вместо шага 5:

```sh
docker compose -f compose.yaml -f compose.vps.yaml up --build
```

Host CA `/etc/max-smart-city/russian-trusted-root-ca.pem` монтируется read-only в
`/etc/ssl/custom/max-root-ca.pem`; Node получает `NODE_EXTRA_CA_CERTS` с этим путём.
Файл должен существовать заранее. TLS verification остаётся включённой; CA не включается в образ/Git.
Проверка сертификатов и маршрута Caddy к loopback порту `APP_PORT` — deployment gates.

## Конфигурация

Все canonical keys представлены в `.env.example`; `node scripts/delivery/validate.mjs` проверяет
двустороннюю parity с `apps/api/src/config/schema.ts`. Пустые required secrets означают необходимость
локального заполнения, а не валидную production-конфигурацию.

| Ключи | Назначение / значения |
| --- | --- |
| `APP_ENV`, `HOST`, `PORT` | `production`, `0.0.0.0`, `3000`; порт приложения внутри контейнера |
| `APP_PORT` | `3000` по умолчанию; публикация app только на `127.0.0.1` хоста для локальной проверки/Caddy |
| `DEMO_MODE` | `true` для экспертного demo; роли SYNTHETIC, не production enrollment |
| `DATABASE_URL` | Postgres connection; в Compose выводится из `POSTGRES_*` |
| `APP_SESSION_SECRET` | Локальный секрет подписи session, минимум 32 UTF-8 bytes |
| `MAX_ADAPTER_MODE` | `live`; `fake` разрешён typed schema только в `APP_ENV=test` |
| `MAX_BOT_TOKEN`, `MAX_WEBHOOK_SECRET` | Рабочие значения только вне Git; webhook secret также нужен MAX subscription |
| `PUBLIC_APP_URL`, `PUBLIC_API_BASE_URL` | Реальные HTTPS URL Mini App/API; API suffix `/api/v1` |
| `BUILD_SHA` | 40 lowercase hex, immutable image identity и tag/OCI label |
| `MAX_INIT_DATA_MAX_AGE_SECONDS`, `MAX_INIT_DATA_FUTURE_SKEW_SECONDS` | `300`, `30`; freshness и допустимый clock skew |
| `APP_SESSION_TTL_SECONDS` | `900`; после expiry fresh MAX bootstrap |
| `MAX_REQUEST_TIMEOUT_MS`, `MAX_SUBSCRIPTION_RECONCILE_INTERVAL_MS` | `10000`, `300000` |
| `NOTIFICATION_WORKER_POLL_INTERVAL_MS`, `NOTIFICATION_WORKER_CONCURRENCY` | `1000`, `4` |
| `NOTIFICATION_RETRY_BASE_MS`, `NOTIFICATION_RETRY_MAX_MS` | `1000`, `300000` |
| `NOTIFICATION_LEASE_MS`, `NOTIFICATION_MAX_ATTEMPTS` | `30000`, `8`; lease больше request timeout |
| `TEST_AUTH_DEMO_PROFILE`, `TEST_MAX_INIT_DATA_SIGNING_KEY` | Пусты; только изолированные automated E2E, не экспертный live доступ |
| `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD` | Delivery keys: `city`, `city`, локально сгенерированный hex password |
| `NODE_EXTRA_CA_CERTS` | Delivery/Node key: задаётся VPS override, не typed application key |

## Порты, остановка, повторный запуск, persistence

Postgres `5432` доступен только внутри Compose network и не имеет `ports:`. App слушает `PORT=3000`
внутри контейнера и публикуется как `127.0.0.1:${APP_PORT:-3000}` на хосте; извне этот порт
недоступен. MAX не входит в Compose. Публичные `80/443` принадлежат Caddy, который проксирует
API, webhook и static traffic на loopback app. Адрес localhost не является public MAX доступом.

```sh
docker compose ps
docker compose exec app node scripts/delivery/healthcheck.mjs
docker compose exec app node -e "fetch('http://127.0.0.1:3000/api/v1/system/info').then(r=>r.json()).then(console.log)"
curl http://127.0.0.1:3000/health/ready
docker compose stop
docker compose start
docker compose restart app
docker compose down
docker compose up --build
```

`down` удаляет контейнеры/сеть, **сохраняет** named volume `max-smart-city_postgres-data`.
Case, history, attachments, DemoRun и notification intents сохраняются в этом volume.
Сохраняйте Compose project name `max-smart-city`, иначе будет выбран другой volume.
`restart app` не переигрывает миграции; после нового исходного SHA используйте `up --build`.
Для смены DB password на существующем volume нужен отдельный DB credential rotation, простая правка
`.env` не меняет пароль существующего PostgreSQL role.

## Как эксперт проверяет решение

Полный [VERIFICATION runbook](docs/submission/VERIFICATION.md) задаёт последовательность действий,
ожидаемые состояния, отрицательные проверки, повтор DemoRun, restart persistence и SHA comparison.
[DATA-API.yaml](DATA-API.yaml) содержит method/path, role, request/schema/test fixtures, success и negative checks;
[openapi.yaml](openapi.yaml) — OpenAPI 3.1. Статус route/schema parity указан в checklist.

Путь: MAX → новый DemoRun → Resident создаёт Case → УК принимает/выбирает/отправляет → Contractor
принимает → файл и Result → реальное MAX уведомление → Resident оставляет замечание → УК возвращает
тот же Case на N+1 → тот же Contractor отправляет новый Result без нового accept → Resident подтверждает
→ УК завершает. Второй DemoRun повторяет путь с новым Case, сохраняя первый.

Тестовые данные и ID: [SYNTHETIC_DATA](docs/submission/SYNTHETIC_DATA.md). Текущий seed содержит
сантехнику/электрику; чтобы проверить приоритетный сценарий отопления, UK Admin заранее создаёт отдельную
SYNTHETIC категорию «Отопление / стояк» с доступом в помещение и PHOTO requirement через config API/UI.
Это настройка справочника, а не изменение seed или product scope.

## Интеграции, ограничения и сдача

Реальная проверяемая интеграция к сдаче: MAX launch, signed initData, webhook, Bot API notification,
native/web attachment download. Факт доставки уведомления и загрузки подтверждается live evidence.
Backend/DB workflow — собственная реализация. SYNTHETIC жители, адреса, сотрудники, подрядчики,
категории, тексты и изображения не являются выгрузкой CRM/ГИС ЖКХ. Реального подключения к CRM,
ГИС ЖКХ, расписаниям мастеров и платёжным системам нет; официальная регистрация обращения не заявляется.
Границы MVP и текущие delivery gaps — в [KNOWN_LIMITATIONS](docs/submission/KNOWN_LIMITATIONS.md).

[SUBMISSION_CHECKLIST](docs/submission/SUBMISSION_CHECKLIST.md) содержит обязательные gates, включая
build ≤ 5 min, presentation PDF, технический первый слайд, route parity и online availability.
Валидаторы — в [scripts/delivery/README](scripts/delivery/README.md).
Действующие нормативные документы: [Product Freeze](docs/01_PRODUCT_FREEZE.md),
[Product Spec](docs/02_PRODUCT_SPEC.md), [Interface Contracts](docs/05_INTERFACE_CONTRACTS.md).
