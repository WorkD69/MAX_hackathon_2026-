# TG-030 — Docker, compose, migration startup и restart persistence

## 1. Identity / BASE_SHA

`TASK_ID = TG-030`; `RISK_CLASS = DELIVERY`; `Primary Ownership = LANE-A`; `CONTRACT_BASE_SHA = 6a2b1c3d1c1eedd79ac20d16cc4b76af30a21fc8` (проверенный `origin/main` при authoring). Этот SHA относится **только к контракту**. Базу будущей implementation назначает Integration Agent после завершения TG-029 и сверяет её с `git rev-parse HEAD`. Сейчас разрешены только authoring и self-check; implementation и canonicalization `main` заблокированы.

## 2. Goal

Обеспечить сборку из исходного кода и локальный запуск командой `docker compose up --build`: PostgreSQL с named volume, последовательные migration и idempotent seed, готовое приложение со static Mini App/API и работающий NotificationIntent/outbox worker согласно финальному runtime TG-029. Обычные `down`/`up` сохраняют бизнес-данные. MAX остаётся внешней платформой.

## 3. Canonical sources

Иерархия `AGENTS.md`: `docs/01_PRODUCT_FREEZE.md` и `docs/02_PRODUCT_SPEC.md` задают продукт; `docs/03_ARCHITECTURE.md` §§20–22, 24 и ADR-023/024 задают Docker, storage, startup, readiness; `docs/05_INTERFACE_CONTRACTS.md` §37A задаёт delivery outputs; `docs/09_HACKATHON_CRITERIA.md` §§4, 8 задают воспроизводимость и лимит сборки. `tasks/TASK_GRAPH.md` §TG-030 задаёт scope и рёбра. `tasks/TASK_TEMPLATE.md` задаёт обязательные поля. Reviewed контракт TG-029: `06ea3e237f6481306bce291603703635b2e21f79`; он **не** является свидетельством завершения TG-029 implementation. Для будущей реализации inspect-only: финальный TG-029 registry, TG-003 `apps/api/src/config/schema.ts` (`ENV_KEYS` и mode validation), TG-008 seed, версия migrations/runner из `packages/db`, TG-019 worker и TG-028 launcher interface.

## 4. Dependencies / unlocks

Фактический `TASK_GRAPH`: `Depends On = TG-029`; `Unlocks = TG-032`; `Parallel With = TG-027, TG-031`. TG-029 implementation должна быть завершена и интегрирована в назначенную стабильную базу **до** TG-030 implementation. TG-027/TG-031 не получают право менять Docker-файлы и не становятся скрытыми direct dependencies. TG-028 может реализовать E2E параллельно: TG-030 использует его уже определённые входы без правки E2E source.

## 5. Allowed write scope

Сейчас единственный разрешённый файл — `tasks/TG-030_TASK_CONTRACT.md`. В будущей implementation whitelist: root `Dockerfile`, `compose.yaml`, `.dockerignore`, `.env.example`, `docker/entrypoints/**` для container startup и `tests/delivery/tg-030/**` для Docker/config parity/launcher checks. Root `package.json`, lockfile и другие root manifests меняет только Integration Agent по точному dependency request. Это не расширяет текущий authoring scope.

## 6. Forbidden scope

Не менять Product Freeze/Spec, Architecture, Task Graph, Data Model, Interface Contracts, migrations, seed semantics, TG-003 config loader/schema, TG-019 worker logic, TG-028 E2E source, TG-029 registries и root manifests. Не добавлять Redis, очередь, отдельный frontend, MAX container, публичный DB/admin UI, публичный maintenance reseed или авторитетное хранение в container filesystem. Не включать рабочий Bot Token, DB password, session/webhook secret в git, compose defaults, build args, Docker layers, static bundle или logs; не использовать `down -v` как обычную остановку.

## 7. Required behavior / invariants

- **Topology и сборка.** Multi-stage image собирает pinned workspace и frontend assets из исходников; финальный runtime содержит только необходимые artifacts. Минимальная canonical compose topology из Architecture §21: `postgres` с named volume, one-shot `migrate` из app image, `app`, который обслуживает static Mini App/API и запускает уже реализованный outbox loop. Если TG-029 закрепит иной process split, TG-030 описывает и проверяет фактический split без дублирования worker/claim loop и без изменения продуктовой или persistence topology.
- **Startup graph.** PostgreSQL health → successful versioned migrations → successful idempotent bootstrap seed → app/worker readiness. Dependency conditions/entrypoint обязаны обеспечивать порядок и корректно завершаться с ошибкой. Ни app, ни worker не обрабатывают запросы/intent при провале migration или seed. `/health/ready` остаётся failed, если DB недоступна, migrations не current или app не инициализирована; `/health/live` не зависит от MAX. Не стартовать молча со stale schema. Повторный `up --build` не дублирует seed и не переписывает существующие Case/history.
- **Runtime mode и секреты.** Локальный one-command profile допускает явно обозначенный TG-003 `APP_ENV=test`/fake adapter для synthetic проверки; это не доказательство live MAX. Необходимый локальный session secret генерируется только во время запуска или передаётся через untracked environment, без статического рабочего значения в repo/image/compose. Live mode требует реальные значения извне по TG-003 validation; отсутствие обязательного секрета завершается явной ошибкой. MAX Bot API и webhook находятся вне compose.
- **Persistence.** PostgreSQL volume сохраняет Case/current projection и iterations/history, attachments включая bytes, NotificationIntent/outbox status, DemoRun/history, а также связанные configuration/identity/idempotency facts через `docker compose down` и повторный `docker compose up --build` без удаления volume. Container writable layer и process memory не являются источником истины. Повторный demo создаёт новый DemoRun/Case, сохраняя старый.
- **Config parity.** `.env.example` документирует каждый externally configurable ключ из TG-003 `ENV_KEYS` с режимом/назначением и безопасным пустым placeholder для секретов; не содержит неизвестных application keys. Автоматический bidirectional parity test сравнивает имена с экспортом центральной typed schema, проверяет отсутствие дубликатов и секретных значений. Docker/Compose-only переменные, если нужны, явно отделены от application keys, обоснованы и не передаются в TG-003 как выдуманные ключи. Изменение TG-003 schema возвращается её owner, не выполняется здесь.
- **E2E launcher.** Compose предоставляет для TG-028 ровно environment-neutral inputs `application_base_url`, optional `api_base_url`, `test_auth_demo_profile`, `seed_scenario_ref`; URL и scenario берутся из фактического compose output/seed, не из захардкоженных в E2E port/ID. Contract smoke client валидирует profile; неизменённый TG-028 launcher может исполнить suite против compose после интеграции обеих задач.
- **Security и build.** PostgreSQL доступен только внутри compose network, если явно требуемый dev contract не утверждает иное; DB admin UI отсутствует. Публичным остаётся только нужный app endpoint. Сборка измеряется на зафиксированном SHA и среде; elapsed Docker build ≤ 5 минут без первой загрузки base images, с сохранёнными command, timings и критерием исключения pull.

## 8. Dependency requests

На стадии authoring: `NONE`. Перед implementation Integration Agent должен предоставить stable SHA с завершённым TG-029, действующие runner/seed/worker entrypoints и TG-028 launcher contract. Если требуются новый пакет, root script/manifest, изменение `ENV_KEYS`, migration/seed/worker или E2E source, TG-030 передаёт конкретный запрос соответствующему owner/Integration Agent и ждёт решения. Не чинить чужую семантику через compose.

## 9. Acceptance criteria

На чистой машине с Docker/Compose и исходниками локальный test profile выполняет `docker compose up --build`, проходит порядок §7 и достигает healthy/ready; передача внешних live credentials не требуется для synthetic test profile. Второй запуск с тем же volume успешен и seed idempotent. После обычного `down` и `up --build` все перечисленные persistent facts читаются с прежними ID, bytes и outbox statuses; новые demo facts не меняют старые. Инъекция migration failure не допускает ready app/worker и не скрывается автоматическим retry. Config↔`.env.example` parity и launcher smoke проходят; TG-028 source остаётся неизменным. Image secret scan чистый, DB/admin не опубликованы, измеренный build удовлетворяет ≤ 5 минутам. Результат не утверждает real MAX evidence: это gate TG-033 после TG-032.

## 10. Required tests / verification commands

Будущий implementation agent обязан записать exit codes и evidence, включая точные команды реализации для parity и launcher checks:

1. `git status --short; git rev-parse HEAD` перед записью, сверка с назначенным **implementation** base SHA; `git diff --check` и file-scope diff после изменений.
2. Automated bidirectional TG-003 `ENV_KEYS` ↔ `.env.example` parity: missing/extra/duplicate keys, documented mode, empty secret placeholders; negative fixture с новым unknown key обязана падать. Проверка не читает реальные credentials.
3. `docker compose config --quiet` для default и E2E profile; contract smoke client валидирует четыре launcher inputs (с optional `api_base_url`) и фактическую доступность URL; TG-028 suite затем запускается без source edits.
4. На disposable volume: `docker compose up --build`, наблюдение PostgreSQL healthy, migration/seed success, app `/health/live` и `/health/ready`, работающего outbox loop; зафиксировать service/exit status и логи без secrets.
5. Повторный `docker compose up --build` на том же volume: idempotent seed, отсутствие дубликатов и сохранение существующего Case/DemoRun.
6. Создать проверяемые Case + attachment bytes + NotificationIntent/outbox status + DemoRun/history через штатные API/test harness; выполнить `docker compose down`, затем `docker compose up --build`; сверить ID, history, hash bytes, intent/status и demo record. Не использовать `down -v` для этого теста.
7. На disposable test volume инъецировать failure одной migration: `migrate` nonzero, app/worker не ready, `/health/ready` не success; после устранения failure запуск восстанавливается. Не менять committed migration для теста.
8. Secret scan tracked files, built image/layers/config и logs на реальные credentials/sentinels; проверка отсутствия public DB/admin ports и container-local authoritative files.
9. Повторный timed `docker compose build` после начального base-image pull: записать SHA, host/CPU, Docker/Compose version, cache state, start/end/elapsed; pass только при ≤300 s без времени первого base pull.

Для каждого шага отсутствие исполняемой проверки, placeholder suite или неполное evidence означает `FAIL`, а не assumed pass.

## 11. Git / integration handoff

Authoring branch `codex/tg-030-contract` создана от `CONTRACT_BASE_SHA`; commit/push только этого файла существующей человеческой Git identity. Сверить полный local commit SHA с `git ls-remote origin refs/heads/codex/tg-030-contract`, подтвердить clean worktree. `main` не merge/rebase/push в этой задаче. Для будущей implementation Integration Agent назначает новый stable `BASE_SHA` после TG-029; agent повторяет preflight, выполняет тесты §10, commit/push task branch и передаёт SHA, evidence и dependency requests. Канонизацию `main` выполняет отдельный Integration Agent.

## 12. Blocker protocol

Неверный `BASE_SHA`, незавершённая TG-029 implementation, неизвестные изменения, невозможный one-command startup при утверждённой TG-003 config, несовместимый migration/seed/worker интерфейс или выход за ownership блокируют implementation; сообщить точный source и owning task. При необходимости изменить продуктовые правила: **STOP — `SPEC CONFLICT`**, явное решение команды и запись в `docs/07_DECISIONS.md`; обход через Docker запрещён. Contract authoring остаётся самостоятельным reviewable output, но не снимает implementation blocker.
