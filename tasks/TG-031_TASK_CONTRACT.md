# TG-031 — Lean Task Contract: OpenAPI 3.1 и DATA-API.yaml

## 1. Identity / BASE_SHA

`TASK_ID = TG-031`; `RISK_CLASS = DELIVERY`; `Primary Ownership = LANE-D`; `CONTRACT_BRANCH = codex/tg-031-contract`; `CONTRACT_BASE_SHA = 5493905ac2e9ed7bbc21527acd9d4dc0eddc9bc5` (актуальный `origin/main` при authoring). Это база **только контракта**. Implementation получает новый стабильный `BASE_SHA` после завершения всех прямых зависимостей; исполнитель сверяет его с `git rev-parse HEAD` до любой записи. Текущая стадия: `CONTRACT AUTHORING ONLY`, implementation blocked, canonicalization `main` запрещена.

## 2. Purpose / required context

Результат будущей TG-031: корневые `openapi.yaml` версии **3.1.x** и `DATA-API.yaml`, которые описывают фактически запускаемый публичный HTTP API финальной композиции TG-029, плюс автоматическая проверка их точности. Собственный API — обязательный delivery artifact по `docs/09_HACKATHON_CRITERIA.md` §9, поскольку проект его реализует.

Читать по приоритету `AGENTS.md`, `docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md` §§4–6, 23–24, `docs/03_ARCHITECTURE.md` §§20–21, 25–26, `docs/04_DATA_MODEL.md` для wire-смыслов, `docs/05_INTERFACE_CONTRACTS.md` §§1–5, 6–9, 10–27, 29–34, 37A, `docs/09_HACKATHON_CRITERIA.md` §9, `tasks/TASK_GRAPH.md` §TG-031 и §§7, 9, `tasks/TASK_TEMPLATE.md`, `docs/08_PROJECT_STATE.md`. Для точных схем читать экспорт `packages/contracts/src/index.ts` и только нужные TG-002 schema modules; для фактических методов и путей — финальный TG-029 Fastify app factory/registry и его integration evidence. Старые перечни путей в Interface Contracts задают семантику, но не доказывают регистрацию endpoint.

## 3. Graph / dependencies / unlocks

Фактический `tasks/TASK_GRAPH.md`: `Depends On = TG-002, TG-017, TG-018, TG-019, TG-029`; `Unlocks = TG-032`; `Parallel With = TG-027, TG-030`; WAVE 11. Контрактные ориентиры: TG-017 `11e5612caf05dbbca27ed224359becdf7b596029`, TG-018 final `1dc606b4e510c469a26bb6859c9de949904d0b22`, TG-019 `a2b89b96d8b33d799483953a71ca0f2f305c4087`, TG-029 reviewed `06ea3e237f6481306bce291603703635b2e21f79`. Эти SHA **не являются** implementation/checkpoint evidence.

До implementation Integration Agent предоставляет: (1) интегрированный TG-002 schema export; (2) завершённые и принятые TG-017 read model, TG-018 configuration API, TG-019 MAX/webhook implementation; (3) завершённую TG-029 композицию, её один production Fastify factory/registry, runnable build и стабильный checkpoint SHA; (4) новый `BASE_SHA`, содержащий все пять прямых dependency outputs. Если хотя бы один пункт отсутствует, статус `DEPENDENCY_BLOCKED`; нельзя документировать предполагаемый registry. TG-027 и TG-030 не становятся скрытыми прямыми зависимостями TG-031.

## 4. Ownership / allowed and forbidden files

На стадии authoring разрешена запись **только** `tasks/TG-031_TASK_CONTRACT.md`. Для будущей implementation исчерпывающий write scope: `openapi.yaml`, `DATA-API.yaml`, `scripts/verify-tg031.mjs`. Последний скрипт выполняет все проверки §10; если для запуска потребуется иная зависимость, manifest, fixture или дополнительный script, сначала точный dependency/file request Integration Agent, без самовольного расширения scope.

Read-only: финальная TG-029 API composition, TG-002 schemas, TG-017/018/019 modules и TG-027 tests. Запрещены production route/handler/schema modifications, отдельный test registry, `apps/**`, `packages/**`, root manifests/lockfile, Docker/deploy files, нормативные `docs/**`, `tasks/TASK_GRAPH.md`, другие Task Contracts и `main`. Ни production mutation, ни generic `PATCH /api/v1/cases/{caseId}` не создаются этой задачей.

## 5. OpenAPI 3.1 surface

`openapi.yaml` содержит `openapi: 3.1.x`, валидные `info`, `servers` без рабочего host/secret, `paths`, components/security schemes. Единица учёта — пара `(HTTP method, normalized path template)`; document set обязан совпасть с **фактически доступными публичными** application/API/webhook/diagnostic routes одного финального TG-029 registry. Каждая зарегистрированная публичная business mutation обязана иметь operation; каждая описанная operation обязана отвечать существующему route. Статические файлы Mini App и framework-generated mechanics (например, implicit HEAD/OPTIONS) допускаются вне own API только через явный машинный allowlist в скрипте с причиной и проверкой фактического поведения; нельзя исключать вручную business route, webhook или download URL. Итоговый diff множеств пуст.

По фактической регистрации покрыть применимые семейства: MAX auth/session; DemoRun start/restore и actor switch; Case list/snapshot/activity; явные Case commands, comments и result materials; attachment stream и выдачу/потребление download capability; UK Admin configuration reads/mutations; MAX webhook; `/health/live`, `/health/ready`, `/api/v1/system/info`. Условные и optional endpoints описывать лишь если они реально exposed. URL capability берётся из зарегистрированного route, а не выводится из примера `download_url`. Не рекламировать CRM/ГИС, maintenance reseed, test-only bypass, несуществующий generic Case PATCH или internal worker как public HTTP API.

## 6. Schema / example alignment

Для каждой operation зафиксировать path/query/header/body, media type, happy HTTP status, response schema и применимые error status/code. JSON request/response/error schemas должны соответствовать public TG-002 Zod exports; multipart документирует JSON `payload` и binary `files` без подмены bytes JSON-схемой; streaming response описывает headers/content отдельно. Командные headers включают `Idempotency-Key` там, где требует canonical contract; `request_id`/error envelope остаются согласованы с TG-002. `allowed_actions` — серверная подсказка, не credential.

Скрипт проверяет каждое request/response/error example машинно через соответствующий TG-002 Zod schema и OpenAPI schema validator, включая status/media type и обязательные headers; непроверяемых illustrative examples нет. Имена/enum значения берутся из экспорта TG-002: ровно **8** Case states (`CREATED`, `ACCEPTED_BY_UK`, `SENT_TO_CONTRACTOR`, `EXECUTION`, `AWAITING_RESULT_CHECK`, `REMARKS_REVIEW`, `REWORK`, `COMPLETED`) и **4** роли (`RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`). Никаких расширяющих `additionalProperties`, которые приняли бы запрещённые client authority fields, и никаких выдуманных response fields. При расхождении TG-002 с нормативными Product Spec/Interface Contracts — `SPEC CONFLICT`, а не локальная правка чужой схемы.

## 7. Authentication / secret boundary

Для защищённых application operations: Bearer application session, полученный после MAX bootstrap; auth bootstrap принимает raw `init_data` и описывает проверку сервером, не публикуя подпись/токен. Demo actor switch остаётся серверным и доступен только в `DEMO_MODE=true`; публичная спецификация не показывает fake-auth route, обход подписи или разрешение выбрать произвольного actor/tenant. Для webhook — обязательный `X-Max-Bot-Api-Secret` как структурный header/security scheme, сравнение до business processing; никакого действующего значения, Bot Token, DB URL, session secret или capability token в YAML/examples. Диагностика `/api/v1/system/info` отдаёт только безопасный `build_sha` по TG-002/фактическому handler.

Secret scan проходит `openapi.yaml`, `DATA-API.yaml`, `scripts/verify-tg031.mjs` по конкретным credential patterns, private keys, high-entropy literals и явным secret fields; разрешены только нейтральные placeholders и synthetic UUID/host. Любое подозрительное значение проверяется вручную перед commit. DATA-API ссылается на роли/сценарии тестового доступа символическими идентификаторами, не хранит реальные учётные данные.

## 8. DATA-API role / error matrix

`DATA-API.yaml` имеет версию конфигурации, идентификатор решения, placeholder базового HTTPS-адреса, список обязательных checks и схему каждой записи: `id`, `method`, `path`, path/query/header/body или multipart parameters, `role/access`, expected happy status и response format/schema, canonical semantic error status/code, expected visibility (`visible`/`hidden_404`), stale precondition/expected `409` и ссылку на проверяемый сценарий. Структура однозначно машиночитаема; проверка связывает каждую запись с documented operation и зарегистрированным route. Для несуществующего optional route проверка не создаётся.

Минимальные сценарии по фактическим endpoints: auth/session/bootstrap, DemoRun start/restore/switch; Resident create/read/feedback/remark; UK accept/select/send/clarification/rework/completion и UK Admin configuration; current Contractor accept/reject/work/result; comments, attachments/capability; webhook wrong/correct secret и diagnostics. Отдельные negative checks: отсутствие/истечение session `401`; недопустимое действие на **видимом** Case `403`; чужой tenant/run, чужой attachment и старый Contractor после reassignment `404` без утечки; old selection/assignment/iteration/result и competing feedback `409` с `STALE_SELECTION`/`STALE_ASSIGNMENT`/`STALE_ITERATION`/`STALE_RESULT`/`FEEDBACK_ALREADY_SUBMITTED` соответственно; invalid structure `400`, business input `422`, idempotency key required/reuse по canonical mapping. Hidden 404 проверяется **раньше** terminal/stale details. Для каждого обязательного E2E/negative path присутствует конкретная роль, request fixture reference и ожидаемый response shape, включая конфигурационные errors TG-018; blanket `4xx` и «любая роль» не принимаются.

## 9. Inventory algorithm / exclusions

`scripts/verify-tg031.mjs` строит app **из финального TG-029 production factory с production module registry**, используя безопасную test environment/adapter injection только для запуска без внешней отправки; регистрируемые routes при этом идентичны deployable composition. Скрипт извлекает Fastify route metadata или `printRoutes` в нормализованный set методов/шаблонов, отдельно анализирует реально доступные implicit methods и допустимый allowlist §5, парсит OpenAPI `paths`, затем печатает `registered_only` и `documented_only` и завершается non-zero, если любой set непуст. Нельзя использовать hand-built route array, второй app factory, isolated module plugin или только `docs/05_INTERFACE_CONTRACTS.md` как source of truth. Документированные mutations отдельно сравниваются с зарегистрированными public mutations; оба направления должны быть пусты. Проверка выполняется **только после TG-029 final integration**.

## 10. Verification commands / evidence

Future implementation из корня своей approved branch, при наличии всех §3 inputs:

```powershell
git status --short
git rev-parse HEAD
git branch --show-current
npm ci
npm run build
node scripts/verify-tg031.mjs --openapi-lint
node scripts/verify-tg031.mjs --schema-examples
node scripts/verify-tg031.mjs --route-inventory
node scripts/verify-tg031.mjs --data-api
node scripts/verify-tg031.mjs --secret-scan
git diff --check <IMPLEMENTATION_BASE_SHA>
git diff --name-only <IMPLEMENTATION_BASE_SHA>
```

Скрипт должен возвращать non-zero при parse/lint failure, несоответствии TG-002, недействительном примере, ненулевом route diff, пропущенном DATA-API field/check, secret candidate или отсутствии final TG-029 factory. Проверки логируют названия failed checks и counts, не токены/байты. `npm ci`/build нужны для запуска финального registry; отсутствие локальной PostgreSQL или внешнего MAX не заменяется другим registry. Если production factory без DB не может зарегистрировать routes, использовать его утверждённый безопасный injection seam; если seam отсутствует, запросить TG-029 owner, не копировать регистрацию. Фактические команды и их output передаются reviewer; на стадии authoring эти runtime gates имеют статус `PENDING`, не `PASS`.

## 11. Acceptance / escalation

Принять TG-031 implementation можно лишь при одновременном `PASS`: OpenAPI 3.1 parse/lint; TG-002 schema + **все** examples; empty route-vs-spec diff по финальному TG-029 registry; DATA-API structural + scenario coverage; role/error/hidden/stale matrix; no phantom endpoints; no undocumented public business mutations; secret scan; write scope; clean diff. Результат передать TG-032 после отдельной integration проверки; TG-031 не deploy'ит и не утверждает live MAX evidence.

`SPEC CONFLICT`: изменение MUST, восьми состояний, четырёх ролей, access/order/error semantics или попытка поправить Freeze/Spec/Interface Contracts ради документа. `DEPENDENCY_BLOCKED`: не готовы все прямые implementation dependencies, TG-029 final registry или новый stable base. `CONTRACT_DRIFT`: финальный route отличается от TG-002/approved semantics — передать владельцу TG-002/017/018/019/029 и Integration Agent, не скрывать diff. `SCOPE_BLOCKED`: требуется файл/dependency вне §4. При любом из них остановить затронутую implementation, сообщить exact path/operation/schema/expected/actual и dependency request; не обходить test-only spec entry.

## 12. Deliverable / self-check / Git

Сейчас deliverable ровно этот Lean Contract из 12 разделов, без OpenAPI/DATA-API/scripts. Authoring branch создана от `CONTRACT_BASE_SHA`; перед commit проверить `git status`, `git rev-parse HEAD`, branch, `git diff --check`, `git diff --name-only`, 12 numbered headings, graph, ссылки на dependency SHA, все поля `tasks/TASK_TEMPLATE.md`, отсутствие секретов/продуктовых изменений. Stage только `tasks/TG-031_TASK_CONTRACT.md`; commit/push только `codex/tg-031-contract` с существующей human Git identity без AI attribution; сверить local и remote task-branch SHA и clean worktree. Не merge/push `main`.

После authoring требуется independent contract review. Future implementation branch/base назначает Integration Agent только после §3. По завершении implementation исполнитель показывает §10 evidence, exact diff, full commit SHA и push; отдельный Integration Agent решает canonical stable `main` и разблокировку TG-032.
