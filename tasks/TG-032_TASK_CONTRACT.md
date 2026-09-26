# TG-032 — Lean Task Contract: Public deployment и HTTPS/MAX readiness integration

## 1. Identity / BASE_SHA

`TASK_ID = TG-032`; `RISK_CLASS = CRITICAL`; `TYPE = INTEGRATION`; `PRIMARY_OWNERSHIP = LANE-A`; `CONTRACT_BRANCH = codex/tg-032-contract`; `CONTRACT_BASE_SHA = 6a2b1c3d1c1eedd79ac20d16cc4b76af30a21fc8` (сверен с `git rev-parse HEAD` до authoring). Этот SHA относится только к контракту. Текущий статус: **contract authoring only**; implementation и canonicalization `main` запрещены. Будущую implementation базу назначает Integration Agent после закрытия всех прямых зависимостей.

## 2. Goal

Развернуть **один зафиксированный candidate image** на стабильном публичном HTTPS URL Mini App/API, подключить приватный persistent PostgreSQL, server-only secrets и реальный MAX adapter, восстановить/поддерживать необходимую webhook subscription. Во время deployment нельзя пересобирать mutable source: image digest, candidate Git/build SHA и публичный `/api/v1/system/info.build_sha` должны иметь проверяемую связь и точное равенство SHA. Итог — работоспособный deployment checkpoint для TG-033, без заявления о пройденном live mobile/web MAX сценарии.

## 3. Canonical sources

Приоритет: официальные требования и уточнения → `docs/01_PRODUCT_FREEZE.md` (§§14–15, MAX/проверка) → `docs/02_PRODUCT_SPEC.md` (§§1.10, 21, AC-008/009, INV-046) → `docs/05_INTERFACE_CONTRACTS.md` (§§1.4, 27, 37A) и `docs/03_ARCHITECTURE.md` (§§7.2, 20, 24–25) → код. Для delivery gates: `docs/09_HACKATHON_CRITERIA.md` §§4–9. Для исполнения: `AGENTS.md`, `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/TASK_GRAPH.md` §TG-032 и WAVE 13, `tasks/TASK_TEMPLATE.md`, финальные контракты и implementation evidence пяти §4 dependencies. Конкретный host/provider остаётся deployment parameter; выбор документируется в implementation evidence без изменения продуктовой семантики.

## 4. Dependencies / unlocks

Фактический `tasks/TASK_GRAPH.md`: `Depends On = TG-026, TG-027, TG-028, TG-030, TG-031`; `Unlocks = TG-033`; `Parallel With = NONE`; WAVE 13. Contract references: TG-026 final closed `44a59b0d234d6b962fc77189ad3c75379faf62fb`; TG-027 reviewed `c31e689836e45745c9f7f56afc0110e4f586d9f4`; TG-030 `9f616d241e682ae4238103203e814d1e17b10072`; TG-031 `cc4f13b18ff8218aade5cb54cd3d7ce412b5158f`. Контракт TG-028 может готовиться параллельно с **authoring** TG-032; его SHA фиксируется до implementation. Перечисленные SHA — контракты, не доказательство завершения implementations.

`IMPLEMENTATION_BLOCKED_UNTIL_ALL_DEPENDENCIES = YES`: нужны пять завершённых и интегрированных implementations, их финальные SHA/результаты тестов, новый стабильный `main` и отдельный implementation `BASE_SHA`. Authoring/review TG-032 этот gate не снимают.

## 5. Allowed write scope

Сейчас разрешён **только** `tasks/TG-032_TASK_CONTRACT.md`. Будущая implementation может писать `deploy/**`, принадлежащую TG-032 hosting configuration внутри `deploy/**` и `docs/evidence/deployment/**`; evidence датируется и связывается с candidate SHA и image digest. Если hosting provider требует конфигурацию вне `deploy/**`, сначала точный file request Integration Agent; самовольного расширения scope нет. Existing Docker/compose/runtime/API, TG-026–031 тесты и документы используются read-only.

## 6. Forbidden scope

Не менять Product Freeze/Spec, Task Graph, Architecture, Interface Contracts, чужие контракты, app/DB/domain/MAX/worker logic, migrations, TG-030 `Dockerfile`/`compose.yaml`/`.env.example`, TG-031 OpenAPI/DATA-API, root manifests или `main`. Нельзя коммитить реальные secrets, встраивать их в image layers/build args/static frontend, показывать в logs/evidence screenshots; публиковать PostgreSQL, DB admin UI или maintenance reseed; хранить authoritative data в ephemeral container filesystem; применять destructive reseed к judging данным. Нельзя использовать fake MAX adapter в публичном deployment, подменять обязательный MAX flow прямой web-ссылкой, отключать TLS certificate verification или полагаться на laptop/scale-to-zero с ненадёжным cold start.

## 7. Required behavior / invariants

- **Fixed artifact.** Candidate cut задаёт полный Git/build SHA и immutable image digest. Развёртывается именно этот digest без rebuild; runtime `GET /api/v1/system/info` возвращает `build_sha`, **строго равный** candidate SHA. При несоответствии deployment не принимается.
- **Public HTTPS.** Стабильный hostname обслуживает Mini App, API и `POST /integrations/max/webhook` на 443 с доверенным сертификатом, полным chain, корректным SAN/hostname и работающим DNS. Сервис доступен весь judging window, с automatic restart и без зависимости от разработческого компьютера или scale-to-zero. Публичный URL API пригоден для обязательной сдачи.
- **PostgreSQL.** БД доступна приложению только по приватной сети, без публичного DB port/admin UI. Данные, включая Case/history, DemoRun, attachment bytes и NotificationIntent/outbox, живут в persistent storage и сохраняются при обычном restart/redeploy того же candidate. Maintenance reseed не выставляется наружу.
- **Secrets.** `DATABASE_URL`/DB password, `APP_SESSION_SECRET`, `MAX_BOT_TOKEN`, `MAX_WEBHOOK_SECRET` provisioned через secret manager/runtime environment вне Git и image. Логи, evidence, frontend bundle и public diagnostics не раскрывают значения. Ротация/повторное provision не требует пересборки image.
- **MAX.** Runtime выбирает real adapter. Bot/Mini App entry ведёт на правильный публичный HTTPS Mini App URL; webhook subscription указывает на ожидаемый HTTPS endpoint и сильный отдельный secret. Неверный/отсутствующий `X-Max-Bot-Api-Secret` отвергается до обработки; правильный принимается по canonical handler и отвечает в установленный ≤30 s. Startup/periodic reconciliation обнаруживает потерю/auto-unsubscribe и восстанавливает требуемую подписку, без создания новой product semantics.
- **TLS outbound.** Runtime разрешает DNS и выполняет HTTPS к `platform-api2.max.ru` с **включённой** проверкой chain/hostname и актуальным trust store, включая требуемую MAX цепочку. Отсутствие доверия или outbound connectivity — отдельный MAX preflight FAIL; не отключать verifier.
- **Readiness.** `/health/ready` зелёный только при доступной БД, current migrations и завершённой обязательной инициализации. `/health/live` проверяет живой процесс. Внешняя доступность MAX не является общим blocker readiness по Architecture §24.2; её фиксирует отдельный diagnostic/preflight, чтобы внешний outage не создавал restart loop. Outbox сохраняет canonical retry semantics.

## 8. Dependency requests

До implementation Integration Agent предоставляет: финальные implementation SHA и PASS evidence TG-026/027/028/030/031, стабильный checkpoint `main`, candidate Git/build SHA и immutable image digest с provenance, окончательные runtime config keys/entrypoints и URL ожидания MAX, а также доступ к hosting/DNS/TLS/secret manager/MAX Bot без записи credential в repo. TG-028 contract SHA добавляется к handoff после authoring. Нужные provider-specific files вне §5, shared manifest/config/runtime исправления, изменённый TLS trust bundle или расхождение `build_sha` направляются соответствующему owner/Integration Agent как точный dependency request; TG-032 не правит чужие файлы. На стадии текущего authoring пакетных dependency изменений нет.

## 9. Acceptance criteria

PASS только при одновременном доказательстве: fixed image digest развернут и `build_sha == candidate SHA`; публичные app/API/webhook HTTPS на 443 имеют доверенный полный chain и корректный DNS; `/health/ready` проходит и корректно падает при DB/migration/startup failure; PostgreSQL приватный и persistent после restart/redeploy; сервис автоматически восстанавливается и остаётся доступным в judging window; четыре секрета отсутствуют в Git/image/logs/evidence/frontend; реальный MAX entry URL и webhook subscription соответствуют deployment; wrong secret отвергнут, correct принят, потерянная подписка восстановлена; outbound MAX HTTPS проходит с verification. Evidence в `docs/evidence/deployment/**` содержит дату, candidate SHA, image digest, target hostname, команды/наблюдения/результаты без секретов. TG-033 открывается лишь после этого checkpoint; live notification, mobile/web MAX и downloads доказывает TG-033 отдельно.

## 10. Required tests

Для будущей implementation — сохранить команды, exit codes и безопасные outputs по всем проверкам:

1. `git status --short --branch`, `git rev-parse HEAD`, сверка implementation `BASE_SHA` и пяти upstream SHA/PASS; inspect image digest/provenance, deploy **без build**; `git diff --check` и `git diff --name-only <IMPLEMENTATION_BASE_SHA>`.
2. Deployment smoke: снаружи проверить DNS, HTTPS app/API URL, `/health/live`, `/health/ready`, `GET /api/v1/system/info`; машинно сравнить точную строку `build_sha` с candidate SHA и зафиксировать digest запущенного image.
3. TLS scan/handshake с внешнего клиента: 443, hostname/SAN, срок, доверенная полная цепочка, отсутствие self-signed/неполной цепочки и ошибок verification; insecure flags запрещены.
4. DB privacy: внешняя проверка отсутствия публичного PostgreSQL/admin endpoint; из private runtime подтвердить DB доступ. На штатных синтетических данных зафиксировать IDs/hash attachment bytes/history/outbox, restart app и redeploy того же digest, сравнить persisted authoritative данные и ready. Не запускать reseed/delete для теста.
5. MAX: подтвердить real adapter и Bot → Mini App URL; wrong/missing webhook secret отвергается без business effect, correct secret принимается; проверить текущую subscription, смоделировать её потерю безопасным управляемым способом и подтвердить reconciliation. Не публиковать header value в evidence.
6. Из **того же runtime image** выполнить outbound DNS + HTTPS preflight к MAX Bot API с certificate verification; отрицательный тест невалидной trust chain должен fail closed. MAX outage отражается в MAX diagnostic, но не заставляет `/health/ready` бесконечно перезапускаться.
7. Secret scan: tracked diff/repo, image layers/config, runtime logs, frontend bundle и `docs/evidence/deployment/**` на credential patterns/sentinels; подозрительные значения вручную проверить без раскрытия. Проверить negative readiness для недоступной DB/несовпадающих migrations/незавершённого startup на безопасном test deployment.

Отсутствие исполнимого теста или датированного evidence = FAIL, а не подразумеваемый PASS. Проверки против live MAX не должны содержать реальные токены или персональные данные в артефактах.

## 11. Git / integration handoff

Authoring: branch `codex/tg-032-contract` от §1, stage/commit/push **только** этого файла существующей человеческой Git identity, вернуть полный contract SHA, проверить равенство local/remote branch SHA и clean worktree. После self-check — **один independent review** CRITICAL контракта; review артефакты в репозиторий не добавлять. `main` не merge/rebase/push. После PASS и всех пяти dependencies Integration Agent назначает новый implementation `BASE_SHA`; исполнитель повторяет preflight, выполняет §10, commit/push task branch и передаёт dated deployment evidence и SHA Integration Agent. Только отдельный Integration Agent создаёт stable `main`; TG-033 получает подтверждённый deployed candidate.

## 12. Blocker protocol

При `SPEC CONFLICT` (требуется изменить MAX/product MUST, роли, восемь состояний или критерии), `BASELINE_MISMATCH`, отсутствии любого из пяти implementation outputs, несовместимом image SHA/digest, TLS/DB/secret/MAX failure либо выходе за §5 остановить затронутую implementation и передать owner/Integration Agent точные expected/actual, candidate SHA, безопасные logs/evidence и нужное решение. Не лечить failure fake adapter, обходом TLS, public reseed, пересборкой mutable source или правкой чужой semantics. Для CRITICAL review с `FIX_REQUIRED`: один полный пакет findings → одно пакетное исправление → targeted closure; повторный полный review chain не нужен. Pending TG-028 и прочие implementations блокируют только implementation, а не authoring/review этого контракта.
