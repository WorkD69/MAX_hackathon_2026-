# TG-032 — инфраструктурная передача (prep only)

**Статус:** подготовка решения; приложение не развёрнуто, публичные URL, сертификат, подписка MAX, backup и runtime smoke ещё не проверены. Этот документ передаётся TG-030 и будущему исполнителю TG-032. Он не заменяет PASS зависимостей TG-026/027/028/030/031 и не меняет продуктовые правила.

**Нормативные границы:** официальные уточнения «Общий FAQ (2).pdf», отражённые в [Hackathon Criteria §§4–5, 8–9](../09_HACKATHON_CRITERIA.md), имеют приоритет над внутренними контрактами; [Task Graph](../../tasks/TASK_GRAPH.md) §§ TG-029/030/032; [Architecture](../03_ARCHITECTURE.md) §§ 19–21, 24–25; [Data Model](../04_DATA_MODEL.md) §§ 6.5, 19; [Interface Contracts](../05_INTERFACE_CONTRACTS.md) §§ 1.1, 1.4, 27–28, 37A; точные runtime keys — [`apps/api/src/config/schema.ts`](../../apps/api/src/config/schema.ts). Если готовый TG-029/TG-030 образ расходится с этими контрактами, вернуть дефект владельцу соответствующей задачи до выкладки.

## 1. Однозначная схема и размер сервера

Один постоянно работающий Linux VPS/VM, Docker Engine с Compose plugin, Node **24.21** внутри app build/runtime, PostgreSQL **18**. Один production app image из TG-030 содержит API, статическую web Mini App и outbox worker в составе TG-029/TG-030; отдельно `postgres`, одноразовый `migrate` и публичный Caddy reverse proxy. MAX — внешний сервис, контейнер MAX не нужен. В production `MAX_ADAPTER_MODE=live`; fake/test adapter не используется. Публикуется один экземпляр app, без scale-to-zero. Контейнеры с долгим сроком жизни получают restart policy; migration failure запрещает запуск ready app.

| Профиль | vCPU | RAM | SSD | Применение |
| --- | ---: | ---: | ---: | --- |
| Минимум | 2 | 4 GiB + 2 GiB swap | 40 GiB | Небольшая демонстрационная нагрузка и runtime; локальная сборка допустима только если TG-030 подтвердит build ≤5 минут и отсутствие OOM. |
| Комфортно для сборки и runtime | 4 | 8 GiB | 80 GiB | Сборка multi-stage image, PostgreSQL 18, proxy и app на одной VM с запасом для журналов и вложений. |

Размер — инженерная стартовая оценка для hackathon, не лимит данных: поскольку bytes вложений находятся в PostgreSQL, перед выкладкой проверить фактический объём seed/демо-файлов и свободное место. Если минимальная VM не проходит build gate TG-030, собирать immutable image вне VM и доставлять тот же image digest; runtime остаётся на одной VM. Хост должен переживать перезагрузку без участия ноутбука разработчика. Время системы синхронизируется (NTP).

## 2. DNS, TLS и маршрутизация

**Единственный публичный hostname:** `<public-hostname>` — placeholder стабильного публичного hostname, в том числе выданного хостингом. **Собственный домен и владение DNS не обязательны.** Если выбран собственный домен, DNS `A` указывает на статический публичный IPv4 VM; `AAAA` добавлять только при реально работающем IPv6. Для hostname от хостинга маршрутизацию/TLS обеспечивает провайдер по условиям размещения. После выбора имени оно одинаково используется для сертификата, Mini App, webhook и production config:

| Назначение | Схема / значение |
| --- | --- |
| Mini App, `PUBLIC_APP_URL` | `https://<public-hostname>/` |
| API, `PUBLIC_API_BASE_URL` | `https://<public-hostname>/api/v1` |
| MAX webhook | `https://<public-hostname>/integrations/max/webhook` |
| Диагностика | `https://<public-hostname>/health/live`, `/health/ready`, `/api/v1/system/info` |

В выбранной VM-схеме Caddy принимает **80/tcp** для HTTP-01 challenge и перенаправления на HTTPS, **443/tcp** для HTTPS. Сертификат от публично доверенного CA выпускается и продлевается автоматически; Caddy data volume хранит ACME account/cert state между пересозданиями. Если публичный TLS завершается на хостинге, провайдер обеспечивает ту же внешнюю HTTPS/443/full-chain гарантию и продление; владение доменом для этого не требуется. До отправки Mini App URL организаторам проверить валидный full chain, SAN для точного hostname и автоматическое продление. Self-signed cert, отключение проверки TLS и HTTP webhook запрещены. Режим challenge не должен быть сломан редиректом или firewall. Proxy передаёт исходные `/api/v1/*`, `/integrations/max/webhook`, `/health/*` без обрезания пути, web/static — app; принимает корректные `Host`/`X-Forwarded-*` только от доверенного proxy. Прямой порт app в Internet не публикуется.

**Сеть/firewall:** Internet inbound только 80/443; SSH/управление — через ограниченный административный канал/VPN, без открытого DB/admin UI. `postgres:5432` доступен лишь app/migrate по отдельной private Docker network без `ports`; app дополнительно подключён к сети proxy для исходящего HTTPS. Разрешить app outbound `443/tcp` к `platform-api2.max.ru` и DNS/NTP для разрешения имени и проверки сертификатов; системный CA trust должен поддерживать требуемую текущим MAX цепочку (включая сертификат Минцифры согласно контракту). Сертификаты нельзя обходить `rejectUnauthorized=false` или аналогом. Webhook должен отвечать в пределах 30 секунд.

## 3. Данные, тома, backup и восстановление

- PostgreSQL 18 использует постоянный **именованный** volume, смонтированный в official image на `/var/lib/postgresql` (для 18+ версия `PGDATA` лежит внутри этого каталога). Не монтировать только старый `/var/lib/postgresql/data`. Сохранять один и тот же Compose project/volume name при повторном `up`; обычный `restart` и `down` → `up` не удаляют данные. `down -v` и удаление volume запрещены в runbook штатного перезапуска.
- В PostgreSQL находятся `Case`, события/история, configuration и её audit, `Attachment.content` (`bytea`) с метаданными/связями, DemoRun, идемпотентность и `NotificationIntent`/outbox с lease/retry. Второй artifact volume или object storage для canonical вложений не нужен. Файловая система app/image не хранит authoritative данные. Caddy data volume нужен только для жизненного цикла TLS, не для product data.
- Ежесуточный зашифрованный **off-host** логический backup PostgreSQL (`pg_dump --format=custom` всей application DB, включая `bytea`) с retention минимум 7 ежедневных копий; доступ только оператору. Шифрование/ключи backup вне репозитория и VM. Перед демонстрацией восстановить одну копию в **отдельную** PostgreSQL 18 DB и сверить `Case`, `CaseEvent`, `ConfigurationChange`, число/хеш bytes вложений и `NotificationIntent`. Backup без проверенного restore не считается готовым. Снимок одного Docker volume без согласованного PostgreSQL backup не заменяет этот шаг.
- При обновлении: backup → остановить app/worker → миграция единственным one-shot job → app startup. Migration failure оставляет `/health/ready` неуспешным и не запускает worker. Seed TG-030 идемпотентен; production startup не должен выполнять destructive reseed.

**Проверка persistence после TG-030/TG-032:** создать Case с вложением, событием, конфигурационным изменением и outbox intent (в проверочном сценарии); записать идентификаторы/хеш файла и статусы; `docker compose restart` и затем обычный `docker compose down`/`up`; повторно прочитать тот же Case, историю, config/audit, bytes/hash вложения и тот же intent/его корректное продолжение. Сохраняются также DemoRun и idempotency records. Проверить, что expired claim возвращается в обработку без второго Result/EVT-008. Это **будущий gate**, не выполненный в данной prep-задаче.

## 4. Runtime config и секреты

Production config задаётся только через типизированный loader TG-003. **Секретные значения** предоставляются оператором на VM через secret manager либо закрытый root-owned runtime environment/secret files вне Git, image, build args, логов и backup с исходным кодом. Права закрытого файла `0600`; доступ только службе/оператору. Не помещать токен в web bundle. Ротация требует согласованного обновления webhook subscription и перезапуска app; изменение session secret инвалидирует старые сессии.

| Имя | Смысл |
| --- | --- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Учётные данные и имя application DB для official PostgreSQL image; пароль — секрет. |
| `DATABASE_URL` | Точный key app schema; private `postgres:5432` URL с теми же DB credentials, секрет целиком. |
| `MAX_BOT_TOKEN` | Server-only MAX Bot Token. |
| `MAX_WEBHOOK_SECRET` | Сильный случайный секрет subscription и проверки `X-Max-Bot-Api-Secret`; текущая schema принимает URL-safe буквы/цифры/`_`/`-`, 5–256 символов; выбрать длинное случайное значение. |
| `APP_SESSION_SECRET` | Случайный ключ подписи application session; schema требует 32–4096 UTF-8 bytes. |

**Точные несекретные обязательные keys app:** `APP_ENV=production`, `DEMO_MODE` (значение по утверждённому демо-сценарию), `MAX_ADAPTER_MODE=live`, `PUBLIC_APP_URL`, `PUBLIC_API_BASE_URL`, `BUILD_SHA` (40-символьный commit SHA образа). `HOST`/`PORT` — внутренний listener; `BUILD_SHA` задаётся при сборке кандидата и не меняется при runtime. Остальные допустимые key names TG-003: `MAX_INIT_DATA_MAX_AGE_SECONDS`, `MAX_INIT_DATA_FUTURE_SKEW_SECONDS`, `APP_SESSION_TTL_SECONDS`, `MAX_REQUEST_TIMEOUT_MS`, `MAX_SUBSCRIPTION_RECONCILE_INTERVAL_MS`, `NOTIFICATION_WORKER_POLL_INTERVAL_MS`, `NOTIFICATION_WORKER_CONCURRENCY`, `NOTIFICATION_RETRY_BASE_MS`, `NOTIFICATION_RETRY_MAX_MS`, `NOTIFICATION_LEASE_MS`, `NOTIFICATION_MAX_ATTEMPTS`. Использовать проверенные defaults TG-003, пока TG-030 не обоснует настройку. TG-030 обязан дать `.env.example` **без значений secrets** с полной parity по schema; этот документ не вводит новые app keys.

## 5. MAX: действия после upstream PASS

1. После публикации Mini App и проверки публичного HTTPS/TLS отправить `PUBLIC_APP_URL` через [форму организаторов](https://sbor-ssylok-dlya-mini-prilojeniy.testograf.ru/). Организаторы привязывают URL к выданному боту; дождаться подтверждённой привязки и проверить открытие из реального MAX. Отправка формы ещё не подтверждает binding. «MAX для партнёров» и административный доступ команды к боту не требуются. До этой привязки допустимы локальные web UI/logic tests, но полноценный MAX live-прогон не начинается.
2. Provision `MAX_BOT_TOKEN` и `MAX_WEBHOOK_SECRET` вне репозитория. Установить/сверить subscription точного webhook URL через реализованный TG-019 reconciler: он читает текущие subscriptions, создаёт/обновляет ожидаемую и восстанавливает отсутствующую после restart/auto-unsubscribe. Проверить, что неверный/отсутствующий `X-Max-Bot-Api-Secret` получает canonical `401` без side effects, а валидное событие быстро подтверждается `200`. Не публиковать сам secret в evidence.
   Технический доступ команды — Bot Token: username узнать через `GET /me` с `Authorization: <Bot Token>`. Webhook API доступен по токену и не требует отдельного действия Bot admin/организаторов. Только настройки, недоступные через API, запрашивать у организаторов. В онлайн-этапе участники не меняют имя, ник и логотип бота.
3. Запустить Mini App в MAX, провести server validation signed `initData`; сохранить validated `chat.id/chat.type` как delivery target. Для normal mode — единственный outbound-ready `MaxIdentity`, mapped к Resident; для `DEMO_MODE` — explicit current `DemoRun.notification_recipient_max_identity_id`. Не выводить `chat_id` из `user.id`, `bot_user_id` или `startapp`.
4. Подтвердить при `SubmitResult` один durable intent и доставку в **этот** validated target. Проверить восстановление subscription после удаления/потери, временный сбой outbound и retry/expired lease; фактическое MAX mobile/web evidence остаётся TG-033 после TG-032.

## 6. Готовность, запуск и приёмка TG-032

| Check | Ожидаемый результат |
| --- | --- |
| `GET /health/live` | `200` для живого процесса; не зависит от MAX/DB как readiness. |
| `GET /health/ready` | `200` только при доступной DB, актуальных migrations и инициализированном приложении; иначе `503`. Outbound MAX outage не вызывает restart loop. |
| `GET /api/v1/system/info` | Public read с machine-readable `build_sha`, равным fixed candidate Git SHA/образу; без env/secrets. |
| Startup | DB health → one-shot migrations/идемпотентный seed TG-030 → app init → worker/reconciler startup → ready. Worker не обрабатывает intents до DB/migration readiness. |
| Shutdown/restart | SIGTERM прекращает новые HTTP requests/claims, останавливает timers/reconciler, дожидается bounded in-flight операций и закрывает DB; незавершённый claim восстанавливается после lease expiry. |
| Public/TLS | Стабильный public HTTPS hostname (URL хостинга достаточен), trusted full chain, hostname match, 80→443, 443 webhook, приватный DB, egress MAX с проверкой TLS. |
| Organizer binding | URL отправлен через форму; привязка Mini App к выданному боту подтверждена организаторами и запуском из MAX. |
| Review availability | Бот, Mini App, API и test access остаются доступны весь период экспертной проверки; submitted version после 30.09.2026 12:00 по Москве заморожена. |
| Persistence | Штатный restart и `down`/`up` сохраняют Case/history/config/attachments/outbox; backup restore проверен отдельно. |

**Порядок execution TG-032:** дождаться PASS TG-026/027/028/030/031 и fixed candidate SHA → получить человеческие входы ниже → собрать/взять immutable TG-030 image и проверить `BUILD_SHA` → подготовить VM/маршрутизацию/firewall/volume/backup → установить секреты вне Git → поднять composition и дождаться readiness → проверить TLS/DB privacy/persistence → отправить Mini App URL через форму и дождаться organizer binding; reconcile webhook по Bot Token → проверить MAX delivery target → записать runtime evidence в `docs/evidence/deployment/**`. Только после этого TG-033 собирает live MAX evidence. Ни один из этих действий на внешней инфраструктуре данной prep-задачей не выполнен.

**Человеческий ввод перед TG-032:** стабильный public HTTPS hostname и условия хостинга (собственный домен необязателен), VM/IP и доступ оператора к инфраструктуре, согласованный `DEMO_MODE`, Bot Token и реальные значения остальных secrets, ответственный за отправку URL через форму и контакт с организаторами для binding/недоступных через API настроек, место и ключи off-host backup, fixed candidate SHA после PASS upstream. Управление DNS нужно только при собственном домене; Bot admin access не предоставлен и не является prerequisite. TG-030 получает схему без этих значений уже сейчас.

**Передача TG-034/TG-035:** Docker обязателен; внешние сервисы, которые невозможно запустить в Docker, включая MAX, описать в README с условиями доступа и проверки. Для нашего HTTP API проверить обязательные public HTTPS address, OpenAPI 3.0/3.1, test data/access и `DATA-API.yaml`. Дедлайн — **30.09.2026 12:00 по Москве (UTC+03:00)**; после дедлайна submitted version не заменяется новым SHA/image. Поддерживать бот и решение доступными весь период экспертной проверки.

**Внешняя техническая справка:** [Docker guide по PostgreSQL 18 volume](https://docs.docker.com/guides/postgresql/), [Docker Official Image: изменение PGDATA в 18+](https://hub.docker.com/_/postgres), [PostgreSQL 18: Backup and Restore](https://www.postgresql.org/docs/18/backup.html), [PostgreSQL 18: pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html).
