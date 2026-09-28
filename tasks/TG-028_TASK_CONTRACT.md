# TG-028 — Browser E2E и responsive role flows

## 1. Identity / BASE_SHA

`TASK_ID = TG-028`; `RISK_CLASS = STANDARD`; `TYPE = TEST`; `Primary Ownership = LANE-C`.
`CONTRACT_BASE_SHA = 6a2b1c3d1c1eedd79ac20d16cc4b76af30a21fc8` (actual `origin/main` при authoring). Ветка контракта: `codex/tg-028-contract`. Implementation получает отдельный стабильный `BASE_SHA` после завершения всех direct dependencies; перед работой сверить его с `git rev-parse HEAD`.

## 2. Goal

Проверить в браузере сквозные ролевые сценарии интегрированного приложения на mobile и web/desktop viewport через Playwright. Один и тот же набор E2E файлов запускается с инъекцией окружения локально и позднее из профиля TG-030. Browser UX evidence не подменяет проверку реального MAX по TG-033.

## 3. Canonical sources

Приоритет задаёт `AGENTS.md`: `docs/01_PRODUCT_FREEZE.md` §§6–11, 13; `docs/02_PRODUCT_SPEC.md` AC-001–010, AC-055–058, AC-061–071, AC-076; `docs/03_ARCHITECTURE.md` §§26.7–26.8; `docs/05_INTERFACE_CONTRACTS.md` §§4–5, 25, 35, 37. Границы и порядок: `tasks/TASK_GRAPH.md` (TG-028, TG-030, TG-032), `tasks/TASK_TEMPLATE.md`, `tasks/BACKLOG.md`. Использовать утверждённые role-filtered snapshots, `allowed_actions` и тестовые точки входа интегрированного приложения; не определять новую product/API semantics в тестах.

## 4. Dependencies / unlocks

`Depends On = TG-022, TG-023, TG-024, TG-025, TG-027`; `Unlocks = TG-032`; `Parallel With = NONE`. Известные кандидаты implementation: TG-022 `bdb65737f5d2898537700edea35743f6c95f2355`, TG-023 `999c12befbe3bcf986a314c2a66bac38ea0a7c8a`, TG-024 `30579e4e3bd35f4e7ae1be9c44000f067105b234`, TG-025 `6b031dd6413712d4e79368e938c6c4b80d587bab`. TG-027 имеет reviewed contract `c31e689836e45745c9f7f56afc0110e4f586d9f4`, implementation pending. Эти SHA не заменяют подтверждения завершения всех зависимостей на назначенной стабильной базе. Authoring разрешён; implementation TG-028 блокирован.

## 5. Allowed write scope

Для самостоятельной TG-028 authoring-задачи — только `tasks/TG-028_TASK_CONTRACT.md`. Текущий cross-owner canonical TEST-auth delta отдельно обновляет Architecture/Interface и TG-003/TG-010/TG-028 contracts без runtime-кода. В будущей implementation: `tests/e2e/**`, включая Playwright config, спецификации, test-only launcher/harness entry и тестовые fixtures. Вызов из общего `test:e2e` script и изменения shared manifests — только через владельца shared files/Integration Agent.

## 6. Forbidden scope

Для TG-028 implementation не менять Dockerfile, compose, `.env.example`, production feature/auth code, shared manifests/lockfile, canonical product/architecture/interface documents или Task Graph. Не добавлять production auth bypass, тестовые credentials/actor selector в production build, hardcoded compose ports, `localhost`, hostnames, actor IDs, fixture UUIDs. Не выдавать viewport browser runs за live mobile/web MAX evidence; не менять workflow ради теста и не canonicalize `main` в этой задаче.

## 7. Required behavior / invariants

- Launcher валидирует `application_base_url`, optional `api_base_url`, `test_auth_demo_profile`, `seed_scenario_ref`; профили и seed получают извне, fail-fast при отсутствующих/некорректных обязательных значениях. Ни E2E файлы, ни config не содержат адресов или идентификаторов окружения. TG-030 подаёт те же inputs без правки тестов.
- Для TEST auth launcher принимает только `test_auth_demo_profile=TEST_DEMO_E2E_V1`, совпадающий с backend `TEST_AUTH_DEMO_PROFILE`. Значения `TEST:*` и другие alias отвергаются. Он получает 32-byte signing material через secret-only input `TEST_MAX_INIT_DATA_SIGNING_KEY` (64 lowercase hex), создаёт свежие synthetic `user`/`chat`/`auth_date`, подписывает canonical raw `initData` и передаёт browser только эту строку. Browser вызывает реальный `POST /api/v1/auth/max`; backend проверяет HMAC/freshness, сохраняет identity и выдаёт обычную session. Key не передаётся browser, не сохраняется в E2E файлах, логах или artifacts.
- E2E запуск требует `APP_ENV=test`, `MAX_ADAPTER_MODE=fake`, `DEMO_MODE=true`, оба TEST-поля и отсутствие `MAX_BOT_TOKEN`/`MAX_WEBHOOK_SECRET`. Никаких signing/auth mock endpoints или произвольного actor selector; смена четырёх views идёт через существующий server-authoritative DemoRun flow. TG-027 отдельно проверяет startup/security negatives и API auth path; TG-019 подтверждает только fake outbound compatibility.
- Auth применяется только явно маркированным `TEST` профилем и test-only harness; production сборка не содержит секретов, тестового actor selector или обхода MAX auth. Сценарии работают с разрешёнными test actors и проверяют реальные backend права; A/B — разные actors одной роли, а не пятая role view.
- Каждый сценарий следует одному `Case ID`; смена роли, Result, remark, доработка и завершение не создают новый Case. Проверять серверные состояние, историю, текущие iteration/assignment/result и `allowed_actions`, а не только текст экрана. После success и `409` — authoritative refetch; нет optimistic workflow, stale auto-retry или auto-retarget.
- Happy path: Resident → UK → Contractor (явное принятие) → Result → Resident confirmation → UK completion. Confirmation сама не закрывает Case.
- Remark/rework с тем же исполнителем A: Result #1 → Resident remark → UK ReturnToRework создаёт N+1 ровно один раз, сохраняет актуальный accepted Assignment A и A как текущего исполнителя с LIVE-доступом → A работает в `Доработка` и сообщает Result #2 без повторного принятия → Resident confirmation → UK completion. Прежние Result, Assignment и история неизменны; повторный ReturnToRework не создаёт N+2.
- Rework A→B отдельно: после ReturnToRework A сохраняет актуальный accepted Assignment, статус исполнителя и LIVE-доступ в N+1. Только committed UK SelectContractor(B) создаёт выбор B, очищает current Assignment/executor и отзывает LIVE-доступ A; исторический Assignment A остаётся неизменным. B на стадии selected-only не видит Case и не является исполнителем. UK отдельно отправляет Assignment B: до принятия B видит только разрешённый контекст ожидающего назначения и может принять или отклонить его. После явного принятия B становится исполнителем и продолжает работу в той же N+1; выбор, отправка и принятие B не создают N+2. Initial rejection A→B отдельно: A отклоняет актуальное назначение, UK выбирает/отправляет B, B принимает; тот же Case, неизменная история и та же iteration без увеличения.
- Comments/clarification проверяют общую ленту, допустимые ролевые сообщения и ответ на уточнение в нужном контексте. Четыре role views (`RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`) показывают только свои данные/действия. Repeat DemoRun создаёт новый Case, а прежний Case и его история неизменны; проверка старого Case выполняется только разрешённым test inspection path.
- Изменение разрешённой конфигурации влияет на новые Cases/маршрутизацию без переписывания исторического Case; две категории проходят одни экраны и lifecycle. Восстанавливаемая semantic/stale ошибка показывает ошибку без ложного успеха и позволяет исправить причину и повторить действие явно.
- Два Playwright projects: mobile viewport и web/desktop viewport. Доступность: smoke для primary controls/forms (семантические имена, labels, keyboard focus/operation). Screenshot/trace/video предпочтительно только при failure; артефакты и логи не содержат секретов.

## 8. Dependency requests

`@playwright/test` и реальный root `test:e2e` launcher/script потребуются: сейчас `package.json` содержит только `NO_SUITE_YET` заглушку, Playwright runner не закреплён как dependency. Запросить exact pin/lockfile и script wiring у владельца shared manifests через Integration Agent до implementation; TG-028 не правит эти файлы. Использовать согласованный TEST auth/MAX harness и seed interface; если нужная test-only точка входа отсутствует после завершения direct dependencies, передать конкретный blocker владельцам TG-027/TG-029, не создавать скрытую production точку входа.

## 9. Acceptance criteria

1. Launcher принимает четыре указанных input и отвергает любой профиль кроме точного `TEST_DEMO_E2E_V1`; signing key поступает отдельно как secret-only input. Одинаковые E2E файлы проходят с injected local app и предоставленным позднее TG-030 compose profile без адресных правок.
2. Девять отдельных сценариев: happy path, remark/rework, rework A→B, initial rejection A→B, comments/clarification, four role views, repeat DemoRun, configuration effect, recoverable semantic/stale error. Проверяются `Case ID`, iteration, неизменность исторических Result/Assignment, актуальные Assignment/executor, `allowed_actions` и LIVE-доступ до/после committed SelectContractor(B): A сохраняет authority после ReturnToRework, B selected-only не получает Case, а initial rejection не увеличивает iteration.
3. Mobile и web/desktop projects проходят одинаковые обязательные потоки; accessibility smoke проходит для основных controls/forms; результаты не маркируются как доказательство MAX mobile/web.
4. TEST auth и artifacts не попадают в production build; screenshots/traces/video сохраняются предпочтительно при failure и без секретов. Diff ограничен разрешённым test scope.

## 10. Required tests

На будущей implementation branch: validation тесты launcher inputs (обязательные/optional/invalid/TEST-only, включая `TEST:*` rejection), fresh signed `initData` и реальный auth bootstrap; девять именованных E2E сценариев из §9, отдельные mobile/web projects, accessibility smoke. В remark/rework проверить один переход N→N+1, сохранение accepted Assignment/executor A и LIVE-доступа A, новый Result без повторного accept, неизменность старых Result/Assignment; retry ReturnToRework не создаёт N+2. В rework A→B проверить LIVE-доступ A после ReturnToRework и его отзыв именно при committed SelectContractor(B), очистку current Assignment/executor, отсутствие Case access у selected-only B, ограниченный pending acceptance context после отправки и статус исполнителя B только после accept в той же N+1. В initial rejection A→B проверить неизменную iteration и историю. Запустить E2E против injected local app; после TG-030 повторить тот же suite через compose-provided inputs без изменения файлов. Проверить fail-only artifacts и отсутствие секретов, `git diff --check <implementation-base>`, `git diff --name-only <implementation-base>`. `NO_SUITE_YET` не считается успешным тестом; фактическая команда runner фиксируется после shared-script wiring.

## 11. Git / integration handoff

Authoring: `codex/tg-028-contract` от `CONTRACT_BASE_SHA`; commit/push только контракт с существующей человеческой Git identity. Вернуть полный SHA, self-check, local/remote SHA match и clean worktree. После завершения direct dependencies и отдельной canonicalization Implementation Agent получает новый stable `BASE_SHA`; Integration Agent объединяет и проверяет E2E с TG-030, создавая новый стабильный `main`. Сейчас main не менять; independent review для STANDARD по умолчанию не требуется.

## 12. Blocker protocol

Implementation запрещён, пока TG-022/023/024/025/027 не завершены на назначенной стабильной базе. При несовпадении `BASE_SHA`, необходимости записи вне scope, недоступном TEST harness/seed, несовместимых approved contracts или настоящем конфликте продуктовых правил остановить затронутую работу и передать точный blocker владельцу/Integration Agent. Для изменения Freeze/Spec сообщить `SPEC CONFLICT`; изменение допускается только по явному решению команды с записью в `docs/07_DECISIONS.md`.
