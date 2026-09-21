# Technical Architecture

**Проект:** MAX Hackathon 2026 — трек «Умный город»  
**Статус документа:** Final Candidate Architecture after TCR-MAJ-001 / TCR-MIN-001 Closure Fix  
**Нормативная база:** `docs/01_PRODUCT_FREEZE.md` > `docs/02_PRODUCT_SPEC.md`  
**Ожидаемый SHA:** `03bbece0fe40b24e4c2cdbbc5b8800bc14e82920`  
**Дата синтеза:** 21 сентября 2026

---

## 1. Status / Scope

Этот документ сводит четыре discovery-исследования в одну кандидатную техническую архитектуру hackathon MVP. Он не меняет Product Freeze, Product Spec, роли, lifecycle, MUST, acceptance criteria или официальные требования MAX Hackathon.

Публичное состояние `main` в GitHub согласуется с ожидаемым commit `03bbece0fe40b24e4c2cdbbc5b8800bc14e82920`: commit существует, им `docs/02_PRODUCT_SPEC.md` переведён в `APPROVED PRODUCT SPEC v1.0 — READY FOR CREATE`, текущий repository фиксирует `CREATE / PRE-ARCHITECTURE`, `ARCHITECTURE = NOT YET APPROVED`, `IMPLEMENTATION = NOT STARTED`, `CURRENT_GATE = TECHNICAL ARCHITECTURE`. Локальный `git rev-parse HEAD` в рамках этого архитектурного синтеза не выполнялся, поэтому утверждается соответствие публичного содержимого и истории GitHub, а не локальная криптографическая проверка checkout.

Исходные нормативные документы:

- `AGENTS.md`;
- `docs/00_PROJECT_BRIEF.md`;
- `docs/01_PRODUCT_FREEZE.md`;
- `docs/02_PRODUCT_SPEC.md`;
- `docs/07_DECISIONS.md`;
- `docs/08_PROJECT_STATE.md`;
- `docs/09_HACKATHON_CRITERIA.md`;
- `docs/ORCHESTRATOR_HANDOFF.md`;
- `tasks/BACKLOG.md`;
- `tasks/TASK_TEMPLATE.md`.

Исследовательские входы:

- MAX Platform Technical Feasibility Research;
- Domain / Data / Consistency Discovery;
- MAX Hackathon Frontend Architecture Research;
- Delivery / Verification Architecture Review.

Иерархия при конфликте неизменна: официальные требования → официальные уточнения → Product Freeze → Product Spec → эта кандидатная архитектура.

**SPEC CONFLICTS, обнаруженные при синтезе: 0.**

Этот документ не является self-PASS. Его задача — дать независимому Senior Technical Reviewer достаточно точную архитектуру для решения, можно ли после review переходить к Task Graph и coding waves.

---

## 2. Architecture Drivers

Решения принимаются в следующем порядке приоритетов:

1. полное соответствие Product Spec;
2. корректный end-to-end одного Case;
3. стабильность и отсутствие ложных успешных состояний;
4. воспроизводимость demo и локального запуска;
5. скорость разработки;
6. ясность архитектуры и возможность независимо её проверить;
7. конфигурационное масштабирование общего lifecycle;
8. техническая элегантность.

Главные технические drivers:

- один неизменяемый `case ID` на весь lifecycle;
- ровно 8 product states;
- `selected ≠ sent ≠ accepted`;
- отдельные identity для Selection, Assignment, Result и Feedback;
- один authoritative current projection + неизменяемая история;
- короткие атомарные команды вокруг одного Case;
- защита от stale и concurrent действий;
- backend-authoritative authorization и role-filtered reads;
- реальная MAX identity validation;
- реальный Bot → Mini App flow и реальное MAX notification;
- четыре synthetic demo actor с настоящими backend permissions;
- mobile MAX + web MAX;
- повторный demo без переписывания завершённого Case;
- Docker, migrations, deterministic seed и публичный HTTPS deployment;
- отсутствие fake CRM / ГИС ЖКХ / иных интеграций.

---

## 3. Product Constraints

Архитектура обязана сохранять следующие правила как hard constraints:

- `Case` один и не переоткрывается после `Завершено`;
- верхнеуровневых состояний ровно восемь;
- история значимых фактов append-only;
- выбор подрядчика не даёт подрядчику доступа;
- отправка создаёт конкретное Assignment, но не исполнителя;
- только принятие актуального Assignment создаёт current executor;
- старый Assignment не может влиять на новый, даже при том же contractor;
- refusal возвращает Case в `Принято УК`, не меняя `case ID` и iteration;
- iteration увеличивается только при `Вернуть на доработку`;
- accepted Assignment может пережить границу iteration при rework тем же executor;
- Result всегда отдельный исторический объект;
- formal ResidentFeedback относится к конкретному актуальному Result;
- confirmation Жителя не закрывает Case;
- только УК завершает Case;
- в rework сохраняются старые Results и remark;
- одна observable comment feed, без скрытого resident ↔ contractor канала;
- authorization учитывает role, organization, house/premises, Assignment, current executor, state, iteration, Result и feedback branch;
- `DEMO_MODE` меняет реальные backend rights, но не является production IAM;
- MAX integration реальна, остальные несуществующие внешние интеграции не имитируются как реальные.

Если реализация потребует нарушить любое из этих правил, работа по соответствующему решению должна остановиться с пометкой `SPEC CONFLICT` и ссылкой на Product Spec.

---

## 4. Chosen Technology Stack

### 4.1. Итоговый стек

| Слой | Choice | Why | Rejected alternatives | Product Spec impact |
|---|---|---|---|---|
| Язык | TypeScript | Один язык frontend/backend/MAX adapter; быстрый SDD; типизированные contracts | Python+TS, Go+TS | Не меняет продукт; уменьшает риск расхождения контрактов |
| Frontend | React + Vite | Простая responsive Mini App, быстрый build, один код для web/mobile MAX | Next.js, четыре отдельных UI, native app | Поддерживает одну Mini App и shared Case Details |
| Server state | TanStack Query | Refetch/invalidation после command, cache без второй state machine | Redux как копия server state, custom cache | Поддерживает backend-authoritative UI |
| Routing | React Router | Небольшое число маршрутов, прямой `/cases/:caseId` | Framework routing с SSR | Не влияет на lifecycle |
| Backend HTTP | Fastify + TypeScript | Низкий overhead, ясные plugins/hooks, структурные schema и logs | NestJS, Express, serverless functions | Один backend достаточно для MVP |
| Runtime validation | Zod | Один контракт request/response между backend и frontend, явная проверка input | Только TS types, ручные проверки | Не даёт client data стать trusted |
| DB | PostgreSQL | Транзакции, FK, unique/check, row locks, `FOR UPDATE`, `SKIP LOCKED` для outbox | SQLite, MongoDB, managed NoSQL | Прямо поддерживает INV-044/045 и immutable history |
| SQL/data access | Kysely + `pg` | Typed SQL, прозрачные transactions и row locks, versioned migrations без скрытой магии ORM | Prisma, TypeORM, full ORM domain model | Current projection/history остаются явными |
| MAX integration | Узкий server-side `MaxAdapter` поверх Bot API HTTPS + Webhook | Минимальный реально нужный API, Bot Token только на сервере, легко contract-test | MAX logic во frontend, отдельный bot microservice | Выполняет Bot + Mini App + real notification |
| Auth session | Server-signed short-lived Bearer session token | Не зависит от cookie parity WebView/web; effective demo actor подписан сервером | Client role flag, localStorage IAM, сложный SSO | DEMO_MODE не отменяет real permissions |
| Attachments | PostgreSQL metadata + `bytea` blob | Один durable store, минимальный Docker, достаточен для hackathon объёма | S3/MinIO обязательным сервисом, container filesystem | Фото/файл переживают restart без нового внешнего dependency |
| Notifications | Transactional outbox в PostgreSQL + retry loop внутри backend | Result commit не зависит от внешнего MAX; retry не создаёт второй Result | Синхронный Bot API внутри domain transaction, Kafka/RabbitMQ | Реальный MAX notification без нарушения business atomicity |
| Tests | Vitest + real PostgreSQL integration tests + Playwright + manual MAX gate | Быстрые domain/API tests и реальные concurrency semantics БД | Только unit tests, full enterprise test pyramid | Проверяет normative invariants и mobile/web вручную |
| Logging | Fastify/Pino structured JSON | Достаточно для hackathon debugging, request/case/command correlation | ELK/SIEM/tracing platform | Помогает доказать stale/error handling |

Версии зависимостей должны быть pinned в implementation/submission dependency files. Архитектура не привязана к конкретному minor release.

### 4.2. Почему не full-stack framework

SSR, server components и публичная SEO-поверхность продукту не нужны. Mini App является интерактивным authenticated client внутри MAX. Разделение React build + Fastify API остаётся проще для отладки MAX context, Docker и independent review.

### 4.3. Почему Kysely, а не full ORM

Для этого домена важнее прозрачные transactions, explicit `SELECT ... FOR UPDATE`, composite constraints и понятный SQL, чем богатая entity lifecycle ORM. Domain invariants живут в application/domain layer, не в ORM callbacks.

### 4.4. Почему attachments в PostgreSQL

Hackathon demo использует небольшой объём синтетических фото/файлов. Отдельный S3/MinIO добавил бы credentials, lifecycle, network failure и ещё один persistent service. PostgreSQL уже обязателен и persistent. Поэтому MVP хранит бинарные данные в отдельной таблице/поле `bytea` с configurable size limit. Если после MVP потребуется большой объём, storage abstraction допускает перенос байтов в object storage без изменения Case lifecycle.

---

## 5. System Context

```text
                         EXTERNAL PLATFORM
                               MAX
              ┌────────────────┴────────────────┐
              │                                 │
      Bot events / open_app              Bot API messages
              │                                 ▲
              ▼                                 │
        HTTPS Webhook                            │
              │                                 │
      ┌───────┴─────────────────────────────────┴───────┐
      │                  Public App                     │
      │                                                 │
      │  React Mini App (static build)                  │
      │        │                                        │
      │        ▼                                        │
      │  Fastify Backend                                │
      │  - Auth / MAX initData validation               │
      │  - Application authorization                    │
      │  - Case commands / reads                        │
      │  - MAX adapter / webhook                        │
      │  - Notification outbox worker                   │
      │  - Attachment delivery                          │
      └──────────────────────┬──────────────────────────┘
                             │
                             │ private DB connection
                             ▼
                       PostgreSQL
        current projection + history + config + blobs + outbox
```

MAX не контейнеризируется и не имитируется как локальный сервис в production topology.

---

## 6. Component Architecture

### 6.1. Mini App

Одна responsive React Mini App для всех четырёх ролей. Она не содержит собственную state machine Case.

Основные части:

- application shell;
- MAX platform adapter;
- auth bootstrap;
- DEMO_MODE role/run controls;
- routes `Cases`, `Create Case`, `Case Details`, `Configuration`;
- server-state layer;
- presentation mapping;
- command forms;
- единый stale/error pattern.

### 6.2. Backend

Один deployable backend-процесс с внутренними модулями:

- `auth`;
- `authorization`;
- `cases`;
- `commands`;
- `read-models`;
- `configuration`;
- `attachments`;
- `demo`;
- `max-adapter`;
- `notifications`;
- `health`.

Это модульный monolith, не микросервисы.

### 6.3. PostgreSQL

PostgreSQL хранит:

- authoritative current projection Case;
- immutable/historical business objects;
- append-only `CaseEvent`;
- configuration;
- users/bindings;
- MAX identity link data;
- demo run metadata;
- command idempotency records;
- attachment bytes;
- notification outbox.

### 6.4. Внутренние зависимости

UI не обращается напрямую к DB или MAX Bot API. MAX-specific frontend code ограничен адаптером. Все business mutations проходят backend commands.

---

## 7. MAX Integration Architecture

### 7.1. Bot → Mini App

Основной launch path:

1. пользователь открывает MAX Bot;
2. Bot показывает действие `open_app`;
3. Mini App открывается по публичному HTTPS URL;
4. Mini App получает raw signed `initData` из MAX Bridge;
5. raw `initData` отправляется backend для server-side validation;
6. backend выдаёт application session token;
7. Mini App загружает role-filtered data.

MUST-flow **не зависит** от передачи per-button payload через `open_app`. После generic launch пользователь может открыть доступный Case из server-side списка. Это сознательно устраняет непроверенную зависимость от одинаковой payload semantics на всех клиентах.

Документированный `startapp/start_param` используется только как optional contextual launch. Он не является identity-link mechanism, не является authorization source и не используется как обязательная корреляция Bot-start ↔ Mini-App-start: официальный deep link открывает Mini App без обязательного запуска бота. Start payload должен быть opaque, коротким и не содержать trusted authorization data.

### 7.2. Bot transport

Публичный demo/production transport: **Webhook**.

Нормативный production contract на дату этой ревизии:

- outbound Bot API base host: `https://platform-api2.max.ru`;
- Bot Token передаётся только сервером в `Authorization` header; query-параметр для токена не используется;
- runtime/container обязан доверять актуальной цепочке сертификатов MAX, включая требуемый текущей документацией сертификат Минцифры;
- webhook endpoint доступен публично только по HTTPS на порту `443`, с доменным именем, совпадающим с CN/SAN, и полной доверенной certificate chain; self-signed certificate не допускается;
- при создании подписки server задаёт отдельный webhook `secret`; каждый входящий webhook до parsing/business processing проверяет `X-Max-Bot-Api-Secret`;
- webhook должен вернуть HTTP `200` не позднее 30 секунд; длинная domain transaction в webhook handler запрещена;
- MAX выполняет повторные попытки при ошибке доставки; длительная недоступность может привести к автоматическому удалению подписки, поэтому приложение обязано иметь reconciliation/preflight проверки существования нужной подписки и восстановление подписки после потери;
- MAX network call не входит в Case transaction.

`MAX_WEBHOOK_SECRET` и `MAX_BOT_TOKEN` — server-only secrets. Для automated tests используется fake `MaxAdapter`, а не fake claim о реальной MAX integration.


### 7.3. MAX adapter boundary

Приложение знает интерфейсы, а не детали Bot API:

- validate Mini App init data;
- receive/parse webhook update;
- send user message;
- build/open Mini App action;
- persist/reconcile validated MAX identity and outbound `chat.id/type` binding.

MAX-specific response schemas не распространяются в domain layer.

### 7.4. MAX identity и outbound delivery binding

Архитектура **не принимает как факт**, что Mini App `user.id` равен Bot API `user_id`.

После server-side validation raw `initData` backend сохраняет как отдельные validated facts как минимум:

- Mini App `user.id`;
- `chat.id`;
- `chat.type`;
- время/контекст подтверждения.

Нормативный delivery binding для обязательного MAX notification — подтверждённый `chat.id`, полученный из валидированного signed `initData` и пригодный для `POST /messages?chat_id=...`. `bot_user_id` может дополнительно храниться для observability/сопоставления, но MUST notification **не зависит** от равенства `user.id == bot_user_id`.

`MaxIdentity` считается outbound-ready только если backend имеет валидированный и пригодный delivery target. Data contract закрепляет два связанных инварианта: один `AppUser` может быть mapped максимум к одному `MaxIdentity`, а `LINKED_CONFIRMED` допустим только при `delivery_chat_id IS NOT NULL AND delivery_chat_type IS NOT NULL`. Эти delivery values по-прежнему появляются только из server-validated signed MAX `initData`.

**Normal-mode Case notification recipient** определяется детерминированно: это **единственный outbound-ready `MaxIdentity`, mapped к `Case.resident_user_id`**. Backend не имеет права выбирать `first`, `latest`, любой `arbitrary` `LINKED_CONFIRMED` row или иным образом вводить selector semantics поверх этой relation. `NotificationIntent` snapshot'ит validated `delivery_chat_id/type` именно этого identity.

В normal mode `CreateCase` выполняет early readiness gate: **до** создания `Case`, `CaseIteration #1`, initial business facts и EVT-001 backend обязан убедиться, что Resident имеет этот единственный mapped outbound-ready `MaxIdentity`; иначе команда fail-closed с `MAX_DELIVERY_TARGET_NOT_READY`. `SubmitResult` сохраняет отдельный defensive current recheck перед созданием Result/EVT-008/NotificationIntent.

Demo semantics не меняются: `Start DemoRun` fail-closed, если явно заданный `DemoRun.notification_recipient_max_identity_id` не outbound-ready, а notification recipient в demo определяется только этим explicit field, а не mapping synthetic Resident.

`startapp` не используется для обязательного identity linking. Business/domain model не зависит от V-02 equality и не предполагает `mini_app_user_id == bot_user_id`.


---

## 8. Mini App Architecture

### 8.1. Одна Mini App / четыре роли

Не создаются Resident App, UK App, Admin App и Contractor App как четыре приложения. Роль меняет server-provided data/actions, но не lifecycle model.

### 8.2. Shared Case Details

Главный экран процесса:

```text
Case snapshot
+ role-filtered fields
+ current workflow context
+ role-filtered activity
+ allowed_actions
+ revision/freshness metadata
```

`activity` — единая каноническая проекция истории: один успешный business fact отображается ровно одним item, anchored by `CaseEvent.event_id` и упорядоченным по `event_seq`. `Comment`, `Result`, `ResidentFeedback` и attachment metadata только enrich соответствующий event item; отдельный второй item для того же факта не создаётся.

### 8.3. Server state

TanStack Query хранит remote state. Локально остаются:

- поля формы;
- состояние modal/accordion;
- pending indicator;
- in-memory application session token;
- текущий route.

Case workflow и permissions не копируются в Redux-подобный global store.

### 8.4. Refresh strategy

- initial fetch;
- refetch после любого command;
- refetch после `409`;
- refetch после demo actor switch;
- refetch при возврате Mini App в foreground;
- manual refresh.

WebSocket/SSE не обязательны и в MVP не используются.

### 8.5. No optimistic workflow mutation

До backend success UI не меняет business state. Допустим только визуальный `pending`. После success command response UI refetch'ит snapshot.

---

## 9. Backend Architecture

### 9.1. Layering

```text
HTTP routes
  ↓
Auth context / request validation
  ↓
Application command/query service
  ↓
Authorization policy
  ↓
Domain command rules
  ↓
Repository / transaction boundary
  ↓
PostgreSQL
```

### 9.2. Queries

Queries формируют role-filtered read model. Они не возвращают «полную запись Case для последующего CSS hiding».

### 9.3. Commands

Каждое значимое действие имеет отдельный command handler. State является следствием команды.

Запрещён контракт вида:

```http
PATCH /cases/{id}
{ "state": "..." }
```

### 9.4. Transaction template

Для mutating request действует единый порядок.

До domain validation backend сериализует `(idempotency principal, Idempotency-Key)` через нормативный `CommandExecution` reservation mechanism из §17. Затем Case command выполняется так:

```text
BEGIN
→ create/claim idempotency execution for principal+key
→ lock Case row: SELECT ... FOR UPDATE
→ re-resolve authoritative active AppUser / RoleBinding / access / DemoRun scope
→ authorization / tenant / demo_run visibility
→ terminal guard
→ exact target currentness / stale validation
→ state and business validation
→ lock/read mutable configuration rows required by the command in canonical order
→ domain writes
→ current projection + Case.updated_at
→ append CaseEvent(s)
→ create NotificationIntent if required
→ increment Case.revision
→ finalize CommandExecution canonical response using post-command revision
COMMIT
```

Для foreign-tenant или foreign-DemoRun Case authorization/visibility выполняется **до** terminal/state/stale errors; внешний ответ — hidden `404`.

Для `CreateCase` Case row ещё нет: после idempotency reservation transaction revalidates actor/access and acquires configuration locks before snapshot/read; `case_id` и `iteration_id` pre-generated, а deferred composite FK обеспечивает создание `Case` + `CaseIteration #1` к COMMIT. В **normal mode** до любых writes `Case` / `CaseIteration` / EVT-001 дополнительно выполняется fail-closed readiness check единственного `MaxIdentity`, mapped к Resident: identity обязан быть outbound-ready, иначе `MAX_DELIVERY_TARGET_NOT_READY`. В **DEMO_MODE** этот normal mapping gate не применяется к synthetic Resident: recipient остаётся explicit `DemoRun.notification_recipient_max_identity_id` по §12.7.

Перечни эффектов в command-specific разделах являются **atomic logical effect set**, а не альтернативным физическим insert/update order. Нормативный физический порядок transaction — только порядок выше; отступление допускается лишь там, где отдельный явно указанный FK/deferred-FK contract требует конкретной последовательности insert'ов, при сохранении одной DB transaction.

Для `CreateCase` post-command `Case.revision` остаётся **1**: шаг `increment Case.revision` в общем шаблоне означает переход от отсутствующего/pre-creation revision к первой committed revision `1`, а не увеличение уже инициализированного `1` до `2`.

Canonical lock order для затрагиваемых сущностей:

1. idempotency principal/key reservation;
2. Case row, если существует;
3. `Organization`;
4. `House`;
5. `Premises`;
6. `Category`;
7. `Contractor`;
8. `OrganizationContractor`;
9. actor/access/binding rows в stable primary-key order;
10. child/domain writes.

Config writers используют совместимые `FOR UPDATE` locks в том же порядке; dependent commands используют `FOR SHARE`/эквивалент, конфликтующий с update. Snapshot одного Case не может быть собран из разных committed configuration versions.

При любом failure до commit business write отсутствует.


---

## 10. Authentication

### 10.1. MAX bootstrap

Frontend получает **raw signed `initData`**, а не использует `initDataUnsafe` как trusted identity.

`POST /api/v1/auth/max`:

1. получает raw `initData`;
2. backend проверяет HMAC по актуальному алгоритму MAX с `MAX_BOT_TOKEN`;
3. проверяет freshness `auth_date` по configurable policy, по умолчанию не старше рекомендованного MAX окна;
4. извлекает validated MAX Mini App identity и validated `chat.id/chat.type` delivery context;
5. разрешает/создаёт application session context и обновляет outbound MAX delivery binding;
6. возвращает short-lived server-signed Bearer token.

### 10.2. Application session token

Token содержит минимум:

- real validated MAX identity reference;
- `effective_actor_id`;
- `demo_mode`;
- `demo_run_id` при demo;
- expiry;
- session nonce/version.

Token подписан server secret. Client не может заменить actor/role без нового token, выданного backend.

Session token идентифицирует выбранный context, но **не является долгоживущим snapshot прав**. На каждом protected read backend re-resolve authoritative `AppUser.active`, `UserRoleBinding.active`, соответствующие organization/contractor bindings, `ResidentPremisesAccess`, `UKHouseAccess`, а в demo — current `DemoRun`/`DemoRunActor`. Для mutation эта revalidation выполняется внутри transaction. Revocation/изменение binding влияет на следующий request и не ждёт expiry token.

Token хранится frontend только в memory. После reload Mini App выполняет bootstrap заново из актуального MAX context; при `DEMO_MODE=true` bootstrap server-side восстанавливает current DemoRun того же real MAX identity и тем самым тот же `primary_case_id`, если он уже создан. Это убирает зависимость от cookie/localStorage parity mobile/web.

### 10.3. Bot Token

`MAX_BOT_TOKEN` никогда не попадает в frontend bundle, API response, logs, seed или repository.

---

## 11. Authorization

Authorization выполняется backend для **каждого** read и command.

### 11.1. Resident

- только собственные Cases;
- только разрешённые premises/house;
- formal feedback только по current Result/current iteration;
- comment только в допустимых states/context;
- никогда не завершает Case.

### 11.2. UK Employee

- только Case своей organization;
- только доступные houses;
- route/assignment/feedback decision actions по state;
- видит полную рабочую историю разрешённого Case.

### 11.3. UK Admin

Права UK Employee + configuration своей organization. Не получает доступ к другой УК.

### 11.4. Contractor Employee

До accepted:

- только current pending Assignment своей contractor organization;
- только limited acceptance context;
- только `accept/reject`.

После accepted:

- только если contractor является current executor;
- разрешённые working comments/result/material actions.

После rejection/reassignment:

- LIVE read/write запрещён;
- старый Case не возвращается через текущие contractor queries.

### 11.5. Data filtering

Недоступные данные сервер вообще не сериализует. Например exact rejection reason не приходит Resident client.

В `DEMO_MODE` к обычным role/scope checks добавляется обязательная test-security boundary: `Case.demo_run_id == session.demo_run_id`; run принадлежит current real MAX identity и имеет `ACTIVE` status для mutations. Case другого run из current run скрывается как `404`. Attachment/activity reads наследуют ту же границу.

---

## 12. DEMO_MODE

### 12.1. Разделение identity и actor

`real MAX identity` отвечает на вопрос «кто открыл Mini App».  
`effective demo actor` отвечает на вопрос «какого synthetic участника сейчас представляет эксперт».

Это разные сущности.

### 12.2. Ровно четыре role views

Frontend показывает ровно четыре Product role views:

- Resident;
- UK Employee;
- UK Admin;
- Contractor Employee.

Seed может содержать Contractor A Employee и Contractor B Employee, но это два actors одной роли, а не две role views. Frontend не выбирает A/B по business state.

Для Contractor role view backend resolves concrete synthetic actor из current `DemoRun.primary_case_id`:

1. если существует current pending Assignment — actor соответствующего contractor;
2. иначе если существует current executor — actor этого contractor;
3. иначе используется deterministic scenario default contractor actor, не дающий прав на Case, пока domain context их не создаст.

Returned session всегда содержит конкретный pre-created `effective_actor_id` с настоящими bindings.

### 12.3. Current DemoRun и cross-client restore

Для каждого real validated MAX identity в demo существует не более одного `ACTIVE` current DemoRun.

`Start DemoRun` в одной transaction:

- lock real `MaxIdentity`;
- архивирует предыдущий `ACTIVE` run этого identity, не меняя его Cases/history;
- создаёт новый `ACTIVE` run;
- проверяет outbound-ready notification recipient;
- делает новый run current.

Fresh MAX bootstrap в mobile/web server-side находит этот единственный `ACTIVE` run и возвращает его `demo_run_id`. Application session получает этот id. Reload не создаёт новый run.

### 12.4. DemoRun ↔ Case

Новый run начинается без Case. `CreateCase` Resident actor в current run atomically:

- создаёт Case с `Case.demo_run_id = session.demo_run_id`;
- устанавливает `DemoRun.primary_case_id`, если он `NULL`;
- если primary Case уже существует, случайный второй primary Case не создаётся: request получает deterministic conflict/replay semantics.

Все reads, commands, activity и attachments основного demo flow scoped по current `demo_run_id`. Mutation старого/archived run из новой current session невозможна.

### 12.5. Server-enforced switch

`POST /api/v1/demo/session/actor` разрешён только если server `DEMO_MODE=true`.

Backend:

- проверяет real MAX session;
- проверяет current active DemoRun;
- принимает **role view**, а не contractor alias как authority;
- server-side resolves concrete actor по правилам §12.2;
- проверяет actor в `DemoRunActor` allowlist;
- выдаёт новый signed session token с `effective_actor_id`.

Payload `role=ADMIN` или произвольный `actor_alias` сам по себе никогда не даёт прав.

### 12.6. DEMO_MODE=false

- switch endpoint отвечает `403 DEMO_MODE_DISABLED`;
- synthetic actor selection игнорируется;
- identity → application user mapping работает обычным способом.

### 12.7. Реальное MAX notification в demo

В demo synthetic Resident не обязан иметь отдельный реальный MAX аккаунт. `DemoRun.notification_recipient_max_identity_id` указывает на outbound-ready real MAX identity эксперта с validated delivery `chat_id`. Когда synthetic Contractor submit'ит Result, outbox отправляет реальное MAX сообщение этому target. После получения эксперт переключается на Resident role view и проверяет тот же primary Case.


---

## 13. Case Consistency Boundary

`Case` — главный aggregate consistency boundary.

Case хранит authoritative current projection:

- `current_state`;
- `current_iteration_id`;
- `current_selection_id`;
- `current_assignment_id`;
- `current_executor_contractor_id`;
- `current_result_id`;
- closure projection;
- technical `revision`;
- current event sequence counter.

Исторические facts хранятся отдельно.

Same-tenant/same-Case referential integrity — mandatory DB contract: Organization↔House, House↔Premises, Organization↔Category; current pointers и child iteration принадлежат тому же Case; Result→Assignment и Feedback→Result/iteration same-Case. State machine при этом не переносится в DB triggers.

`Case.current_iteration_id` остаётся `NOT NULL`: CreateCase заранее генерирует `case_id + iteration_id`, а composite FK `(case_id,current_iteration_id) → CaseIteration(case_id,iteration_id)` является `DEFERRABLE INITIALLY DEFERRED`; обе записи обязаны существовать к commit.

Current projection и история не являются двумя независимыми источниками истины: одна business command меняет их атомарно в одной transaction.

---

## 14. State Machine Enforcement

Authoritative state machine живёт только в backend domain/application layer.

Разрешены ровно восемь состояний Product Spec:

1. `Создано`;
2. `Принято УК`;
3. `Передано подрядчику`;
4. `Исполнение`;
5. `Ожидается проверка результата`;
6. `Замечания рассматриваются`;
7. `Доработка`;
8. `Завершено`.

Assignment decision (`PENDING/ACCEPTED/REJECTED`), notification status, DemoRun status, upload status и другие технические статусы не являются product states.

`Завершено` имеет hard terminal guard для process mutations.

Frontend `allowed_actions` не является authority. Backend revalidates command при commit.

---

## 15. Immutable History

### 15.1. CaseEvent

`CaseEvent` — append-only semantic business ledger EVT-001…EVT-017.

Он не используется как full event-sourcing store для runtime replay. Runtime читает Case current projection.

### 15.2. Immutable business objects

Не перезаписываются старые:

- ContractorSelection;
- Assignment identity и факты отправки;
- Result;
- ResidentFeedback;
- Comment;
- attachment content;
- CaseEvent.

Assignment decision изменяется один раз из `PENDING` в `ACCEPTED` или `REJECTED`; сам Assignment не заменяется новым row для «истории после отказа».

### 15.3. Event sequence

Case row lock позволяет atomically выделять monotonically increasing `event_seq` внутри Case. Constraint `UNIQUE(case_id,event_seq)` защищает порядок.

Каждый `CaseEvent.command_id` имеет обязательную relationship к уже созданному `CommandExecution` reservation. Для EVT-015 `result_id` non-null и unique per Result/event-type.

### 15.4. DB protection

Migration должна обеспечить отсутствие обычного application path для `UPDATE/DELETE case_events`. Предпочтительный runtime DB contract — append-only privilege или простой immutable trigger для `case_events`.

---

## 16. Concurrency / Stale Actions

### 16.1. Основной механизм

Выбран один основной consistency mechanism:

> **PostgreSQL transaction + `SELECT ... FOR UPDATE` по Case + повторная validation + exact target IDs + DB constraints.**

Optimistic CAS/versioning не является вторым обязательным consistency framework.

### 16.2. Revision

`case.revision` используется только как freshness metadata для snapshot/logging/debugging. Command correctness не зависит от одного глобального `expected_revision`.

Это важно, потому что некоторые действия могут быть допустимы при неизменном state, а stale определён конкретной target identity.

### 16.3. Exact targets

- send assignment → `selection_id`;
- accept/reject → `assignment_id`;
- result → `assignment_id + iteration_id`;
- resident feedback → `result_id + iteration_id`;
- UK decision по remark → `result_id + feedback_id`; iteration выводится из immutable target entities и сравнивается с `Case.current_iteration_id` под lock;
- no-feedback record → exact `result_id`;
- no-feedback completion → exact current `result_id` + existing EVT-015 **and separate explicit UK process completion basis**; EVT-015 itself is insufficient, no timer/auto-close is inferred.

### 16.4. Configuration concurrency

`CreateCase`, `SelectContractor` и `SendAssignment` не используют «проверил active, потом надеемся». В одной transaction они получают coherent configuration view и держат lock на используемых mutable config rows до commit. Configuration writes берут конфликтующий lock по тому же canonical order. Таким образом деактивация/изменение не может вклиниться между active-check и snapshot/send.

Admin mutation surface ограничен уже предусмотренной Product Spec конфигурацией: basic Organization data; House create/update; Category create/update; contractor directory/Organization binding; default contractor; разрешённые Product roles для pre-created users; contractor employee binding/configuration. Все writes — `UK_ADMIN`, own Organization only, idempotent, без HR invitations/recovery/offboarding и с **обязательным persisted `ConfigurationChange`** в той же transaction. Existing Case snapshots/history не переписываются.

### 16.5. 409 semantics

Если target больше не current или взаимно исключающее действие уже победило, backend возвращает `409` с semantic error code. Никакое действие не переносится автоматически на новый target.

Frontend refetch'ит Case и перестраивает `allowed_actions`.

---

## 17. Idempotency

Все mutating business/config/demo commands, кроме auth bootstrap, требуют:

```text
Idempotency-Key: <opaque unique value>
```

### 17.1. Discriminated principal

`CommandExecution` поддерживает ровно два principal types:

- `APP_USER` — все Case business commands и config writes после выбора effective actor;
- `MAX_IDENTITY` — demo technical commands, которые допустимы до выбора effective actor.

Нельзя подставлять fake/system `AppUser` для real MAX identity.

### 17.2. Serialization до lifecycle validation

Нормативный механизм — ранний durable `CommandExecution` reservation row с unique principal+key.

Внутри одной transaction request:

1. вычисляет normalized request fingerprint;
2. пытается создать `IN_PROGRESS` CommandExecution для principal+key;
3. unique index сериализует concurrent duplicate: второй request ждёт исход первой transaction;
4. после commit первого второй читает stored execution;
5. same fingerprint → возвращает canonical stored success/status;
6. different fingerprint → `409 IDEMPOTENCY_KEY_REUSE`;
7. только владелец нового reservation переходит к Case/config validation.

Для multipart fingerprint = canonical normalized JSON payload + ordered metadata parts + SHA-256 каждого file bytes; multipart boundary/transport encoding не входит в fingerprint.

После successful domain writes тот же row становится `SUCCEEDED` и получает canonical response. При rollback reservation исчезает вместе с transaction.

Idempotency не заменяет Case lock/stale validation: разные keys — разные intents и сериализуются по Case/domain rules.


---

## 18. Notification Delivery

### 18.1. Требование и readiness

После валидного EVT-008 Resident должен получить **реальное MAX сообщение**. UI toast не заменяет notification.

Mandatory flow использует confirmed outbound `chat_id` binding из §7.4. В normal mode recipient — единственный outbound-ready `MaxIdentity`, mapped к `Case.resident_user_id`; в demo — explicit `DemoRun.notification_recipient_max_identity_id`. Normal `CreateCase` fail-closed до Case/Iteration/EVT-001, если mapped recipient не готов. `SubmitResult` **всё равно** выполняет defensive current recheck того же exact recipient/readiness перед Result/EVT-008/NotificationIntent, поэтому ранняя проверка не превращается в долгоживущий readiness snapshot.

### 18.2. Transactional outbox

`SubmitResult` transaction в canonical physical order:

1. создаёт Result и связанные domain records;
2. обновляет current projection (`current_result_id`, state=`Ожидается проверка результата`) + `Case.updated_at`;
3. append'ит EVT-008;
4. создаёт **ровно один** `NotificationIntent` для `(result_id, notification_kind=RESULT_READY)` и snapshot validated `delivery_chat_id/type` exact recipient identity;
5. увеличивает `Case.revision`;
6. finalizes canonical `CommandExecution` response с post-command revision;
7. commit.

Только после commit worker вызывает MAX Bot API.

### 18.3. Durable claim / lease protocol

`SKIP LOCKED` используется только для короткой claim transaction:

1. worker выбирает eligible `PENDING|RETRY` intent `FOR UPDATE SKIP LOCKED`;
2. записывает `status=CLAIMED`, random `claim_token`, `claimed_at`, `lease_expires_at`, increments attempt counter;
3. commit claim transaction;
4. network call к MAX выполняется **вне DB transaction**;
5. finalize transaction обновляет только row с совпадающим `claim_token`;
6. success → `DELIVERED`;
7. temporary failure → `RETRY` + `next_attempt_at`;
8. permanent auth/config error → `PERMANENT_FAILURE`;
9. expired `CLAIMED` lease может быть safely reclaimed/reconciled.

External delivery остаётся at-least-once; crash-after-send/before-finalize может дать редкий duplicate MAX message, но не второй Result/EVT-008.

### 18.4. Operational redrive

После исправления Bot Token/config team-only operational mechanism может перевести **тот же** `PERMANENT_FAILURE` intent обратно в `RETRY`, очистив claim и установив `next_attempt_at`. Redrive:

- не является Product command;
- не создаёт новый Result, CaseEvent или Case state;
- увеличивает operational redrive counter / пишет structured audit log;
- повторно использует тот же `(result_id, notification_kind)` intent.

### 18.5. Failure semantics

MAX outage не откатывает Result/EVT-008. Core Case remains committed; delivery state observable operationally. Restart восстанавливает pending/retry/expired-claim processing из PostgreSQL.


---

## 19. Attachments

### 19.1. Storage

Attachment metadata и bytes хранятся в PostgreSQL. Container filesystem не является authoritative storage.

### 19.2. Supported contexts

- initial Case material;
- working Result material;
- Result link;
- Comment;
- Resident remark.

Initial Case attachments имеют один canonical read representation `initial_attachments[]` в Case snapshot. Visibility: own Resident; UK in scope; contractor of exact current pending Assignment; current executor. Selected-only и historical old contractor access не получают.

Typed attachment links используют mandatory same-Case referential integrity. Work material дополнительно связан с той же current iteration + Assignment; Result/Feedback/Comment attachment link не может указывать на Attachment другого Case.

### 19.3. Result material

Материал результата может быть добавлен в `Исполнение`/`Доработка` без смены state. Это создаёт Attachment/work-material fact и EVT-009, но не EVT-008. `SubmitResult` позднее выбирает допустимые current-iteration materials и связывает их с Result.

Таким образом attachment сам по себе никогда не означает «выполнено».

### 19.4. Security и cross-client download

Canonical bytes остаются за backend authorization; raw DB/blob/storage URL никогда не выдаётся.

Read flow:

1. authenticated request проверяет Case/role/tenant/DemoRun visibility attachment;
2. web MAX может скачать через authenticated backend streaming endpoint;
3. для native MAX backend после той же authorization проверки выдаёт short-lived single-purpose signed HTTPS capability, bound как минимум к `attachment_id`, current authorized principal/session context и expiry;
4. native client вызывает documented `window.WebApp.downloadFile(url, file_name)` по этой capability;
5. capability endpoint повторно валидирует signature/scope/expiry и не раскрывает raw storage locator.

Capability не является long-lived bearer replacement, не хранится как product data и не даёт доступ к другим attachments.

Общие правила:

- MIME/size validation;
- configurable max file size;
- original filename не используется как storage path;
- content hash сохраняется;
- attachment bytes не логируются.


---

## 20. Deployment Topology

### 20.1. Public

Минимальный public deployment:

```text
Internet / MAX
    ↓ HTTPS
TLS/public hostname
    ↓
1 x app container/process
  - static Mini App
  - backend API
  - MAX webhook
  - outbox retry loop
    ↓ private
PostgreSQL persistent DB
```

### 20.2. Requirements

- стабильный публичный hostname;
- HTTPS Mini App;
- webhook только HTTPS/443, trusted full certificate chain, CN/SAN match;
- provisioned `MAX_WEBHOOK_SECRET` и обязательная проверка `X-Max-Bot-Api-Secret`;
- outbound Bot API через `platform-api2.max.ru`;
- runtime TLS trust совместим с текущей MAX certificate chain, включая требуемый сертификат Минцифры;
- webhook subscription reconciliation после restart/outage и восстановление после auto-unsubscribe;
- persistent PostgreSQL;
- secrets через environment/secret manager;
- automatic restart;
- judging window без зависимости от developer laptop;
- один app instance достаточен;
- scale-to-zero для judging нежелателен.

### 20.3. Public exposure

Public:

- Mini App URL;
- `/api/v1/...`;
- MAX webhook;
- health endpoints, если допустимо hosting policy.

Private:

- PostgreSQL;
- maintenance reseed;
- DB admin UI отсутствует;
- secrets.

---

## 21. Docker Model

Local `compose.yaml` содержит минимально:

- `postgres` — persistent named volume;
- `migrate` — one-shot service из app image;
- `app` — Fastify + React static build + outbox loop.

Отдельный frontend container не нужен: multi-stage build собирает React, backend раздаёт static assets.

`docker compose up --build` должен:

1. поднять PostgreSQL;
2. дождаться readiness;
3. применить versioned migrations;
4. выполнить idempotent bootstrap seed;
5. запустить app;
6. дать working health/readiness.

`docker compose down` не удаляет DB volume. Destructive `down -v` — отдельное явное действие.

MAX не входит в compose.

### 21.1. Mandatory submission outputs

Поскольку решение имеет собственный HTTP API, delivery stage **обязан** подготовить и проверить следующие submission artifacts; на текущем architecture gate они ещё не создаются:

- `Dockerfile`;
- `compose.yaml` или `docker-compose.yml`;
- `.dockerignore`;
- `.env.example` без рабочих secrets;
- pinned dependency manifests/lockfiles;
- `README` с назначением, основным сценарием, архитектурой, one-command startup, env/ports, зависимостями/интеграциями/данными, test roles/access, verification, stop/restart;
- OpenAPI `3.0` или `3.1`, соответствующий Interface Contracts;
- `DATA-API.yaml` с обязательными проверками, method/path, parameters, role, expected codes/response format;
- synthetic test data и test access по нужным ролям;
- публичный HTTPS address собственного API на период проверки;
- Docker build check `<= 5 минут` без времени первоначальной загрузки base images;
- fixed submission SHA и процедура сопоставления deployed `build_sha` с этим SHA;
- проверяемая процедура independent E2E в реальном MAX.

Эти артефакты — future delivery output, не разрешение создавать их на текущем blocked coding gate.

---

## 22. Persistence

Authoritative persistence — PostgreSQL.

После ordinary app/host restart сохраняются:

- Case/current projection;
- все iterations/selections/assignments/results/feedback/comments/events;
- configuration;
- users/role bindings;
- MAX identity links;
- DemoRuns;
- command idempotency;
- attachments;
- notification intents/status.

Никакой обязательный state не живёт только в process memory.

---

## 23. Seed / Demo Repeatability

### 23.1. Разрешение противоречия research: reset vs immutable history

Domain research правильно запрещает переписывать завершённый Case. Delivery research правильно требует repeatable demo и recovery. Эти требования совместимы, если разделить **обычный повторный demo** и **maintenance reseed**.

### 23.2. Обычный repeat demo

Публичный `Start new demo run`:

- server-authoritatively создаёт новый current `DemoRun` для real MAX identity;
- в той же transaction архивирует предыдущий `ACTIVE` run этого identity;
- сохраняет прежние runs и Cases без изменений;
- не удаляет Event/Result/history;
- новый run начинается без Case;
- fresh mobile/web bootstrap восстанавливает именно этот current run;
- Resident создаёт новый Case обычной Product Spec командой, которая atomically связывает его с run и устанавливает `primary_case_id`;
- случайный второй primary Case в том же run не создаётся;
- все четыре role views работают только с Cases current run.

```text
DemoRun #1 → Case A → Завершено (history preserved)
Start DemoRun #2 → #1 ARCHIVED; #2 ACTIVE → Case B → новый проход
```

Archive DemoRun — test/demo status, не product state и не destructive reset.


### 23.3.
### 23.3. Maintenance reseed

Отдельная documented team-only команда допускается только при `DEMO_MODE=true`/не-production environment:

- очищает только synthetic demo tenant/runs;
- не является API business action Case;
- не доступна обычному эксперту как способ «вернуть Case назад»;
- не откатывает migrations;
- заново создаёт deterministic configuration/users.

Она нужна для recovery, а не для нормальной repeatability.

### 23.4. Seed contents

Минимум:

- 1 demo УК;
- 1 house;
- 1 premises;
- 1 Resident;
- 1 UK Employee;
- 1 UK Admin;
- Contractor A + employee;
- Contractor B + employee;
- минимум 2 categories;
- organization-contractor mappings;
- default contractor mapping;
- demo actor allowlist.

Seed по умолчанию не создаёт завершённый baseline Case.

---

## 24. Logging / Health

### 24.1. Structured logs

Для command:

- timestamp;
- request_id;
- command_id;
- case_id;
- real max identity reference (не raw token);
- effective_actor_id;
- actor role;
- command;
- state_before/state_after;
- iteration_id;
- target IDs;
- outcome;
- semantic error code.

Для MAX:

- request_id;
- operation;
- recipient/link reference;
- external HTTP status;
- retry count;
- normalized error type.

Не логируются:

- Bot Token;
- raw `initData`;
- Bearer session token;
- DB password;
- file bytes;
- environment dump.

### 24.2. Health

`GET /health/live`:

- process alive;
- не зависит от MAX.

`GET /health/ready`:

- DB reachable;
- migrations current;
- application initialized.

MAX connectivity может иметь отдельный diagnostic check, но внешний MAX outage не должен создавать restart loop.

### 24.3. Build identity

`GET /api/v1/system/info` — public diagnostic read без secrets — обязан возвращать machine-readable `build_sha`. Значение immutable для конкретного image/deployment и соответствует Git SHA, из которого собран artifact. Submission verification сравнивает его с fixed submission SHA.

---

## 25. Security Boundaries

### 25.1. Trust boundaries

1. MAX client → raw initData: **untrusted until backend HMAC validation**.
2. Browser/Mini App → application command: client role/data never trusted.
3. Backend → PostgreSQL: authoritative domain boundary.
4. Backend → MAX Bot API: external dependency, no transaction atomicity with DB.
5. Public attachment request → binary data: authorization required on every read.

### 25.2. Secrets

Минимальные secrets:

- `MAX_BOT_TOKEN`;
- `MAX_WEBHOOK_SECRET`;
- `APP_SESSION_SECRET`;
- `DATABASE_URL`;
- maintenance secret only if a remote maintenance mechanism is ever introduced.

Maintenance reseed предпочтительно CLI/hosting command, а не public endpoint.

### 25.3. Tenant isolation

Organization/house/premises/contractor scopes проверяются backend и дополнительно поддерживаются FK/relationships БД. Case IDs нельзя использовать как доказательство доступа.

### 25.4. DEMO_MODE safety

Production environment должен явно запрещать случайное включение role switch либо делать это startup-fatal по выбранной deployment policy. Минимум — `APP_ENV=production && DEMO_MODE=true` должен считаться explicit high-risk configuration и логироваться как critical.

---

## 26. Test Architecture

### 26.1. Domain/state machine tests

Проверяют все TR-001…TR-022, 8 states, terminal guard, selected/sent/accepted, feedback, rework, completion basis.

### 26.2. Authorization tests

Отдельная matrix:

- Resident isolation;
- UK organization/house isolation;
- Admin organization isolation;
- pending contractor context;
- current executor context;
- old contractor denied;
- DEMO_MODE actor permissions;
- revoked AppUser/RoleBinding/access affects the next request;
- foreign DemoRun Case hidden from current run.

### 26.3. Repository/data integration tests

На реальном PostgreSQL:

- FK/unique/check;
- current pointers;
- immutable event behavior;
- configuration snapshot behavior;
- persistence after restart where applicable.

### 26.4. Concurrency tests

С controlled parallel transactions:

- accept || reject same Assignment;
- late action old Assignment;
- duplicate submit Result;
- confirmation || remark same Result;
- rework || disputed completion;
- completion || late remark;
- duplicate EVT-015;
- concurrent same `Idempotency-Key` canonical replay;
- config update/deactivation racing CreateCase/Select/Send;
- stale send old Selection.

Ожидание: максимум один допустимый business fact; loser получает `409`/idempotent no-op там, где Spec разрешает.

### 26.5. API integration tests

Полные command contracts с auth/authorization/idempotency/error semantics.

### 26.6. MAX adapter tests

- initData validation known vectors;
- webhook parser fixtures;
- outbound message request contract;
- notification retry logic с fake adapter;
- no secret leakage.

### 26.7. Browser E2E

Playwright против deployed/local app с test auth harness, не выдаваемого за real MAX:

- happy path;
- remark → rework → second result;
- contractor reject A → B accept;
- access comments;
- DEMO_MODE role switching;
- repeat DemoRun.

### 26.8. Manual real MAX gate

Automated browser test не заменяет live MAX verification. Перед submission обязательны отдельные проходы в mobile MAX и web MAX.

---

## 27. MAX Live Verification Checklist

Ниже именно integration verification items, а не архитектурные «факты».

### 27.1. Mandatory four unconfirmed questions

- [ ] **`open_app` payload parity.** Проверить, передаётся ли payload/launch context одинаково в web MAX и используемом mobile MAX. Архитектура MUST-flow от этого не зависит; результат влияет только на optional deep context.
- [ ] **Mini App `user.id` vs Bot API `user_id`.** Зафиксировать live evidence, но MUST notification от результата не зависит: production contract использует validated outbound `chat.id`; `startapp` correlation не применяется.
- [ ] **Proactive messaging lifecycle.** Проверить реальную доставку `POST /messages` после типичных состояний Bot/dialog, включая возврат пользователя в Mini App и сценарий после паузы. Если обязательное notification платформенно недоставляемо — это integration blocker, нельзя заменять fake toast.
- [ ] **Mobile/web launch-flow parity.** Полностью пройти Bot → Mini App → auth → same Case → command flow отдельно в web MAX и mobile MAX. Не считать один клиент доказательством второго.

### 27.2. Additional live checks

- [ ] публичный Mini App URL открывается только по HTTPS;
- [ ] webhook принимает MAX, проверяет `X-Max-Bot-Api-Secret` и отвечает `200` <= 30 секунд;
- [ ] subscription reconciliation восстанавливает webhook после simulated loss/auto-unsubscribe;
- [ ] certificate chain на 443 принимается MAX;
- [ ] backend имеет TLS trust/outbound access к актуальному MAX Bot API;
- [ ] `initData` HMAC validation проходит на реальном launch;
- [ ] expired/invalid initData отклоняется;
- [ ] обычный browser URL вне MAX не получает trusted MAX session;
- [ ] native attachment download работает через `window.WebApp.downloadFile` с short-lived scoped capability;
- [ ] web MAX attachment download работает browser-compatible path;
- [ ] file/photo picker достаточен для MUST в web и mobile;
- [ ] Result вызывает real notification по validated delivery `chat_id`;
- [ ] notification не создаёт второй Result при retry/redrive;
- [ ] `PERMANENT_FAILURE` того же intent redrive после исправления config доставляет сообщение без нового Result/EVT-008;
- [ ] reload и второй MAX client восстанавливают current DemoRun/primary Case;
- [ ] frontend показывает четыре role views; Contractor A/B выбирается server-side;
- [ ] organizer Bot token и Mini App URL действительно активны для judging account.

Результаты должны быть зафиксированы как evidence перед снятием integration risk.

---

## 28. Architecture Decisions

После независимого Technical Review следующие candidate decisions следует перенести в `docs/07_DECISIONS.md` отдельными ADR. До review repository не изменяется.

| Candidate ADR | Решение | Причина |
|---|---|---|
| ADR-008 | Модульный monolith: одна Mini App + один backend + PostgreSQL | Минимальный достаточный topology |
| ADR-009 | TypeScript, React/Vite, Fastify, Kysely, PostgreSQL | Один язык, прозрачные transactions, скорость разработки |
| ADR-010 | Case = consistency boundary с relational current projection | Product invariants сформулированы вокруг одного Case |
| ADR-011 | История = append-only `CaseEvent`, без full event sourcing | Immutable semantic history без replay complexity |
| ADR-012 | Explicit business commands, generic PATCH state запрещён | State — следствие business action |
| ADR-013 | Concurrency = transaction + `SELECT FOR UPDATE` Case + target IDs + DB constraints | Простая доказуемая INV-044/045 consistency |
| ADR-014 | Mutating commands используют idempotency keys | Retry/double-click без duplicate facts |
| ADR-015 | Role-filtered snapshot + backend `allowed_actions` | Нет frontend state machine/security-by-CSS |
| ADR-016 | MAX auth: raw initData validated server-side; Bot Token server-only | Platform trust boundary |
| ADR-017 | DEMO_MODE: real MAX session + effective synthetic actor | Реальные permission rules при одном эксперте |
| ADR-018 | Real MAX notification через transactional outbox | External failure не создаёт duplicate Result |
| ADR-019 | Attachment bytes в PostgreSQL для MVP | Один persistent dependency |
| ADR-020 | Configuration relevant fields snapshot в Case | Старые Cases не меняют смысл после config update |
| ADR-021 | Repeat demo = новый DemoRun/new Case; старый Case не reset'ится | Immutable history + repeatability |
| ADR-022 | Maintenance reseed отделён от product actions | Recovery без изменения lifecycle |
| ADR-023 | Public MAX transport = Webhook; MAX не входит в Docker | Production-like integration без fake platform |
| ADR-024 | Versioned migrations + idempotent seed | Reproducibility |
| ADR-025 | No WebSocket/SSE; refetch after command/conflict/focus | MVP simplicity |
| ADR-026 | Real DB concurrency tests + manual mobile/web MAX gate | Доказательство invariants и platform compatibility |

---

## 29. Rejected Complexity

Сознательно не используются:

- microservices;
- Kafka;
- RabbitMQ;
- Kubernetes;
- service mesh;
- full event sourcing;
- CQRS framework;
- workflow engine;
- Redis как обязательный component;
- distributed transactions;
- GraphQL;
- realtime WebSocket/SSE;
- отдельная state machine во frontend;
- object storage как обязательный MVP dependency;
- отдельные приложения по ролям;
- сложная IAM/SSO;
- CRM УК;
- CRM подрядчика;
- ГИС ЖКХ integration;
- универсальный authorization policy engine;
- full observability stack;
- production HR user lifecycle;
- автоматический SLA/timer closure;
- private Resident ↔ Contractor chat.

Эти исключения уменьшают surface area, но не сокращают обязательную business logic.

---

## 30. SPEC Coverage

| Product Spec constraint | Architecture mechanism |
|---|---|
| Один Case / постоянный ID | `Case.case_id` immutable; rework не создаёт Case |
| Ровно 8 states | Backend enum + explicit command transition table |
| Immutable history | append-only `CaseEvent` + immutable business facts |
| selected ≠ sent ≠ accepted | `ContractorSelection` → `Assignment` → accepted decision/current executor |
| Current executor только после accepted | `current_executor_contractor_id` ставится только AcceptAssignment |
| Old assignment stale | `assignment_id` exact target + current pointer + Case lock |
| Iteration only rework | `CaseIteration` создаётся только CreateCase и ReturnToRework |
| Same executor survives iteration | accepted Assignment остаётся authority при N+1 |
| Old Results preserved | отдельные Result rows; unique per iteration |
| Feedback targets Result | `ResidentFeedback.result_id`, unique per Result |
| Resident confirmation does not close | confirmation keeps `Ожидается проверка результата` |
| Only UK completes | authorization + command set |
| Single comment feed | one Comment model; no private channel |
| Role/org/house/assignment isolation | backend policy + role-filtered read model |
| Stale protection | row lock + exact targets + unique constraints + 409 |
| DEMO_MODE real permissions | effective synthetic actor signed by server |
| Bot + Mini App | real MAX launch + public HTTPS Mini App |
| Mobile + web | lowest-common-denominator frontend + manual E2E both |
| Real MAX notification | transactional outbox + Bot API |
| Synthetic data | deterministic demo seed, marked demo |
| Repeatable demo | new DemoRun/new Case, no history rewrite |
| Docker / README readiness | one app + postgres compose topology, migrations/seed/health |
| No fake integrations | only MAX marked real; other external systems absent/mock only if explicitly named |
| Error observability | pending/success/error UI + semantic HTTP errors |
| Configuration scaling | common lifecycle + DB config + Case snapshots |

Архитектура не требует изменения Product Spec.

---

## 31. Open Technical Questions

### 31.1. Blocking architecture questions

**Нет.** Выбранные data, transaction, API, deployment, demo, notification и auth patterns достаточно определены для независимого review.

### 31.2. Non-blocking live integration questions

Остаются четыре platform-verification вопроса, перечисленные в §27:

1. `open_app` payload parity — optional context only;
2. фактическое соотношение Mini App `user.id` и Bot API `user_id` — evidence only, не MUST dependency;
3. proactive messaging lifecycle на реальном judging account;
4. фактическая parity launch-flow mobile/web.

Они не требуют менять domain architecture. Обязательное уведомление адресуется по validated `chat.id`, поэтому V-02 equality не блокирует semantic contract. Пункты 3–4 и реальная delivery/download parity должны быть закрыты live evidence до submission; failure обязательного MUST-flow требует integration escalation, а не fake fallback.

Hosting provider, конкретный public hostname и exact attachment size limit являются implementation/deployment choices, не архитектурными вопросами продукта.

---

## 32. Architecture Gate Recommendation

# **READY FOR FINAL TARGETED RECHECK**

Это не `PASS` и не разрешение начинать coding. Следующий шаг по текущему repository gate — final targeted recheck трёх final-candidate документов:

- `docs_03_ARCHITECTURE_FINAL_CANDIDATE.md`;
- `docs_04_DATA_MODEL_FINAL_CANDIDATE.md`;
- `docs_05_INTERFACE_CONTRACTS_FINAL_CANDIDATE.md`.

Только после внешнего review и явного утверждения решений следует переносить принятые ADR в `docs/07_DECISIONS.md`, снимать architecture block и строить Task Graph.
