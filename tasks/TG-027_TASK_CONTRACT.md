# TG-027 — Lean Task Contract: API, authorization и MAX contract regression suite

## 1. Identity / BASE_SHA

```text
TASK_ID = TG-027
RISK_CLASS = CRITICAL
CONTRACT_BASE_SHA = 6a2b1c3d1c1eedd79ac20d16cc4b76af30a21fc8
CONTRACT_BRANCH = codex/tg-027-contract
CONTRACT_PHASE = AUTHORING_ONLY
IMPLEMENTATION = BLOCKED_UNTIL_ALL_DIRECT_DEPENDENCIES_COMPLETE
```

`CONTRACT_BASE_SHA` — проверенный `git rev-parse HEAD` до написания документа; это не `BASE_SHA` будущего coding-agent. Его implementation `BASE_SHA` — полный SHA нового стабильного `main` после интеграции всех прямых зависимостей, прежде всего финального TG-029. Оркестратор сверяет его с `git rev-parse HEAD` перед implementation. Актуальный base содержит foundation и TG-002, но не финальный TG-029 registry и не исполняемую TG-027 suite. Этот контракт не заявляет, что тесты уже прошли.

## 2. Goal

Проверить HTTP contracts, role matrix, visibility, error ordering, idempotency и MAX boundary через **ту же Fastify application factory и module/route registry**, которые TG-029 формирует для deployable приложения. Suite выполняется на реальном PostgreSQL и зафиксированном candidate SHA, даёт явный pass/fail по группам и отделяет fake MAX test evidence от живого MAX gate TG-033.

## 3. Canonical sources

Приоритет: официальные требования/уточнения → `docs/01_PRODUCT_FREEZE.md` → `docs/02_PRODUCT_SPEC.md` → `docs/05_INTERFACE_CONTRACTS.md` → `docs/03_ARCHITECTURE.md` и `docs/04_DATA_MODEL.md` → код. Необходимы Product Spec (AC-001–076), Interface Contracts §§1–37, Architecture §§26.2, 26.5–26.6, `tasks/TASK_GRAPH.md` (TG-027/TG-029), `tasks/TASK_TEMPLATE.md`, `tasks/BACKLOG.md`, `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `AGENTS.md` и завершённые контракты прямых зависимостей. После интеграции TG-002 его Zod-схемы являются исполняемым источником форматов request/response/error. При расхождении теста с Product Freeze/Spec сообщить `SPEC CONFLICT` без изменения продукта.

## 4. Dependencies / unlocks

Фактический `tasks/TASK_GRAPH.md`: `Depends On = TG-013, TG-017, TG-018, TG-019, TG-029`; `Unlocks = TG-028, TG-032`; `Parallel With = TG-030, TG-031`; owner `LANE-C`. TG-002 — транзитивный schema dependency. Указанные пользователем contract/review SHA: TG-013 `e797423dd0cf20e8ad04e2089d841c335142a477`; TG-017 `11e5612caf05dbbca27ed224359becdf7b596029`; TG-018 `1dc606b4e510c469a26bb6859c9de949904d0b22`; TG-019 `a2b89b96d8b33d799483953a71ca0f2f305c4087`; TG-029 reviewed `06ea3e237f6481306bce291603703635b2e21f79`. Эти SHA обозначают контракты/review, а не completion implementation.

## 5. Allowed write scope

**IN SCOPE / ALLOWED FILES для implementation:** `tests/integration/api/**` и contract fixtures только внутри этого дерева. Для текущего authoring разрешён **только** `tasks/TG-027_TASK_CONTRACT.md`. Fixtures используют синтетические ID, нерабочие secret/token values и детерминированные payload/bytes. Test setup/teardown изолирует tenant, run и idempotency keys.

## 6. Forbidden scope

**NON-GOALS / FORBIDDEN FILES:** production routes, Fastify app/registry, auth/policy, DB migrations, worker, TG-002 schemas, Product Freeze/Spec, OpenAPI/DATA-API, Docker/compose, browser harness. Запрещены второй test router, substitute registry, in-memory DB, клиентская роль как authority, подгонка response shape под snapshot и изменение production semantics ради теста. Дефект возвращается owner task с воспроизводимым случаем; TG-027 не исправляет production код.

## 7. Required behavior / invariants

### 7.1. App, PostgreSQL и build identity

Test bootstrap импортирует публичный factory entrypoint финального TG-029 и не регистрирует route modules повторно. Route inventory сравнивает фактически зарегистрированные `method + path` с §7 и TG-029 composition: пропуск, лишняя публичная business mutation или test-only registry — FAIL. Fastify `inject` допустим как HTTP transport к этой factory. Worker проверяется через фактический testable service seam, если интерфейс доступен. Обязателен реальный PostgreSQL с candidate migrations; отсутствие DB readiness, SQLite, in-memory store и mock repository — FAIL. Изолировать test database/schema, очищать только данные suite. В начале прогона закрепить полный candidate SHA: поле `build_sha` ответа `GET /api/v1/system/info` равно именно ему, а не имени ветки/fixture/другому commit.

### 7.2. HTTP и TG-002 inventory

Матрица `method + path × valid/invalid request × status/code × TG-002 request/response/error schema` покрывает **все** документированные endpoints Interface Contracts §§1–37 и все публичные routes финального TG-029 registry:

- Диагностика/auth/demo: `GET /health/live`, `GET /health/ready`, `GET /api/v1/system/info`, `POST /api/v1/auth/max`, `GET /api/v1/session`, `POST /api/v1/demo/session/actor`, `POST /api/v1/demo/runs`.
- Case reads: `GET /api/v1/cases`, `GET /api/v1/cases/{caseId}`; `GET /api/v1/cases/{caseId}/activity`, если зарегистрирован (иначе activity проверяется в snapshot).
- Case writes: `POST /api/v1/cases`; `POST /api/v1/cases/{caseId}/commands/{accept|select-contractor|send-assignment|accept-assignment|reject-assignment|submit-result|resident-confirmation|resident-remark|request-clarification|record-no-resident-feedback|return-to-rework|complete|complete-with-explanation}`; `POST /api/v1/cases/{caseId}/result-materials`; `POST /api/v1/cases/{caseId}/comments`.
- Configuration reads: `GET /api/v1/config/{organization|houses|categories|contractors|users}`. Writes: `PATCH /api/v1/config/organization`, `POST /api/v1/config/{houses|categories|contractors}`, `PATCH /api/v1/config/houses/{houseId}`, `PATCH /api/v1/config/categories/{categoryId}`, `PUT /api/v1/config/contractors/{contractorId}/binding`, `PUT /api/v1/config/users/{appUserId}/role-binding`, `PUT /api/v1/config/contractors/{contractorId}/employees/{appUserId}`.
- Attachment/MAX: `GET /api/v1/attachments/{attachmentId}`, `POST /api/v1/attachments/{attachmentId}/download-capability`, зарегистрированный capability download URL, `POST /integrations/max/webhook`; notification API/worker-facing HTTP только при существующем публичном interface. Team-only reconciliation не превращается в вымышленный `/api/v1` endpoint.

Каждый request и response проходит соответствующую TG-002 Zod-схему, включая common error envelope; проверяются status/code, content type, `request_id`, допустимые и отсутствующие поля, multipart. Недокументированная публичная mutation или route без schema — FAIL и запрос к owner. Проверять структурные `400`, контентные `422`, auth `401`, forbidden `403`, hidden `404`, context/idempotency `409`, diagnostic/readiness status по Interface Contracts §31.

### 7.3. Commands, snapshots и idempotency

Для **каждой** явной Case mutation из §7 требуются happy, forbidden и stale/exact-target сценарии, если stale target определён. Для CreateCase и операций без existing exact target — current-context конфликт/смена доступности без выдуманного `STALE_*` кода. Матрица включает sent ≠ accepted, Selection, Assignment, current executor, Result, feedback, clarification, ручной no-feedback, rework тем же/новым подрядчиком, обе completion bases и terminal guard. Для application mutations, перечисленных в Interface Contracts §5.1 (auth bootstrap и webhook исключены): обязательный `Idempotency-Key`, canonical replay same key/payload, `409 IDEMPOTENCY_KEY_REUSE` при изменённом payload или байтах файла, отсутствие второго business fact и запрет auto-retarget старого Selection/Assignment/Result. Сверять success response и refetched snapshot: `revision`, state, iteration, events/activity и server-side `allowed_actions` по TG-002; `revision` не становится обязательным CAS target. Успешный `SubmitResult` создаёт ровно одну durable notification intent; последующий MAX transport failure не превращает committed Result в HTTP 500 или повторное создание Result.

Отдельные controlled concurrency/commit checks по Interface Contracts §37: одновременный same-key request ждёт owner commit и возвращает canonical replay; config update/deactivation сериализуется с `CreateCase`/`SelectContractor`/`SendAssignment`; confirmation и remark создают ровно одну formal feedback branch; duplicate Result даёт один Result/EVT-008/NotificationIntent. После `CreateCase` оба circular Case/Iteration FK валидны в committed PostgreSQL transaction. Activity содержит ровно один item на `CaseEvent.event_id` без дублирующих Result/Comment/Feedback facts. При наличии TG-019 worker seam два конкурирующих worker соблюдают claim token/lease, а redrive использует ту же NotificationIntent.

### 7.4. Authorization и role-filtered reads

Обязательные actors/contexts: Resident (свой/чужой Case), UK Employee (своя organization/house и чужой house), UK Admin (своя/чужая organization/config), pending contractor (только собственный актуальный Assignment), current executor, old contractor после отказа/переназначения, foreign tenant/run и revoked AppUser/RoleBinding/access. Для каждой применимой комбинации проверять list, snapshot, activity/feed, `allowed_actions`, attachment metadata/bytes/capability и команды. Скрытые поля **отсутствуют в JSON**: например, reject reason и внутренний UK/audit context у Resident/Contractor. Выбранный до SendAssignment подрядчик не получает Case access; historical Assignment не сохраняет live rights.

В normal mode actor выводится из verified MAX identity → AppUser → active selected binding. В DEMO_MODE real MAX identity отдельно от synthetic actor; client `role`, `actor_alias`, `contractor_id`, tenant/run ID не становятся authority. Отзыв AppUser, RoleBinding, house/premises/contractor binding должен сработать **на следующем request** по старому ещё не истёкшему token для read и mutation. Права нескольких bindings не объединяются.

### 7.5. Error ordering

Для existing Case mutation доказать порядок Interface Contracts §29.1: authenticate → idempotency reservation → Case lock → re-resolve bindings/access → tenant/resource/DemoRun visibility → terminal guard → exact target/currentness → state/pointers → business/input. С одинаковым stale/invalid target сравнить видимый свой Case и foreign/hidden Case: первый получает нормативный `409`/`403` по контексту, второй — `404 RESOURCE_NOT_FOUND` **без** `current_revision`, `case_id`, target ID/reason, state, iteration или иной различающей детали. Повторить для foreign tenant, foreign/archived DemoRun, old contractor и attachment/capability; после revocation проверять нормативный auth/visibility status без stale detail. Для legitimately visible Case с запрещённым действием — `403`. Проверять отсутствие side effects и секретов в error body/headers/logs.

### 7.6. MAX, DemoRun, attachments и worker

`POST /api/v1/auth/max`: официальный подписанный raw initData vector даёт session; malformed, changed-signature, expired vectors отклоняются нормативными `400/401`. `initDataUnsafe`, `startapp`, присланные client identity/role/chat не доверяются. Проверять validated delivery `chat.id/type`, `outbound_max_ready`, fail-closed normal CreateCase и defensive SubmitResult, точного recipient в normal/demo mode; не предполагать `Mini App user.id == Bot API user_id`. В DEMO_MODE проверить Run #1, primary Case binding, fresh bootstrap restore того же Run/Case, server-controlled switch ровно четырёх role views, Contractor A/B resolution, Run #2 без изменения истории Run #1 и скрытие archived Case.

Webhook: верный `X-Max-Bot-Api-Secret` принимает валидный payload, неверный/отсутствующий отклоняется **до обработки** без side effect; retries/dedup не дублируют business fact. Fake MAX adapter допустим лишь в explicit test profile и проверяет outbound request/recipient, retry/lease/finalization, redrive, subscription reconciliation через публичный TG-019 service/ops interface, если существует. Не создавать product endpoint для worker. Capability выдаётся только после свежей authorization, scoped к одному attachment, short-lived, без storage path/secrets; проверять expiry, revocation, bytes/content headers/MIME/size и cross-case/run denial. Fake adapter и browser harness не являются MAX-live evidence.

## 8. Dependency requests

Новые package/shared manifest requests: `NONE`. **DEPENDENCY_REQUESTS:** перед coding получить завершённые implementation/review/integration checkpoint SHA каждого прямого predecessor; новый стабильный `main` с финальной TG-029 composition; путь deployable app factory и команду запуска; экспорты TG-002 Zod-схем; PostgreSQL migrations/seed/test profile; canonical initData-векторы TG-010/TG-019; test-only fake adapter; способ закрепить candidate SHA в `BUILD_SHA`. Пока хотя бы один запрос не закрыт, implementation запрещена. TG-030/TG-031 идут параллельно и не являются прямыми блокерами TG-027.

## 9. Acceptance criteria

Критерии завершения implementation: `FINAL_APP_REGISTRY`, `HTTP_CONTRACT_COVERAGE`, `AUTHORIZATION_MATRIX`, `ERROR_ORDERING`, `TG002_SCHEMA_VALIDATION`, `MAX_BOUNDARY`, `REAL_POSTGRESQL`, `BUILD_SHA`, `WRITE_SCOPE` — все PASS; нет skipped обязательного endpoint/actor/command, `PRODUCTION_WRITE_SCOPE = NONE`. Для config writes обязательны happy/forbidden/foreign-target/current-context cases, idempotency и ConfigurationChange; для каждого Case command — happy/forbidden/stale по §7. Все controlled concurrency/commit checks §7.3 проходят на реальном PostgreSQL с проверкой единственности факта и итоговых FK. TG-027 открывает TG-028/TG-032 лишь после actual suite pass и integration review. Fake MAX evidence не удовлетворяет TG-033.

## 10. Required tests

После открытия implementation gate: выполнить полную `tests/integration/api/**` suite против real PostgreSQL, route inventory diff, TG-002 schema validation, authorization/error/MAX/DB/build-SHA reports; из корня запустить `npm run typecheck`, `npm run build`, `npm test`, затем `git diff --check` и `git diff --name-only`. `npm run test:integration` на текущем base — placeholder `NO_SUITE_YET`, поэтому не принимать его exit 0 за результат. Integration owner закрепляет настоящую runner command и test DB profile перед coding; результат обязан содержать число tests/skips/failures и candidate full SHA. Не печатать значение `DATABASE_URL` или рабочие secrets.

## 11. Git / integration handoff

Contract authoring: ветка `codex/tg-027-contract` от `CONTRACT_BASE_SHA`; commit/push **только** `tasks/TG-027_TASK_CONTRACT.md` с существующей человеческой Git identity, вернуть полный commit SHA, remote SHA match, self-check и clean worktree. Не merge/push в `main`. После закрытия direct dependencies Integration Agent отдельно назначает implementation branch и новый стабильный implementation `BASE_SHA`; coding-agent проверяет `git status --short --branch`, `git rev-parse HEAD`, `git branch --show-current` до работы. После implementation передаёт Integration Agent результаты suite, diff whitelist, commit SHA и push status.

## 12. Blocker protocol

Остановить затронутую работу и передать owner/Integration Agent точный path, request, expected/actual status/body при `SPEC CONFLICT` (изменение Freeze/Spec), `BASELINE_MISMATCH` (иной HEAD), `DEPENDENCY_BLOCKED` (любой predecessor/TG-029 registry/TG-002 schema), `CONTRACT_GAP` (route/schema drift), `SCOPE_VIOLATION` (production write). Не скрывать дефект snapshot или test-only обходом. Для CRITICAL review с `FIX_REQUIRED` — один полный batch findings, один batch fix и targeted closure. После authoring — self-check и **один** независимый review; этот commit не канонизирует `main` и не разрешает implementation.
