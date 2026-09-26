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

Сейчас только `tasks/TG-028_TASK_CONTRACT.md`. В будущей implementation: `tests/e2e/**`, включая Playwright config, спецификации, test-only launcher/harness entry и тестовые fixtures. Вызов из общего `test:e2e` script и изменения shared manifests — только через владельца shared files/Integration Agent.

## 6. Forbidden scope

Не менять Dockerfile, compose, `.env.example`, production feature/auth code, shared manifests/lockfile, canonical product/architecture/interface documents или Task Graph. Не добавлять production auth bypass, тестовые credentials/actor selector в production build, hardcoded compose ports, `localhost`, hostnames, actor IDs, fixture UUIDs. Не выдавать viewport browser runs за live mobile/web MAX evidence; не менять workflow ради теста и не canonicalize `main` в этой задаче.

## 7. Required behavior / invariants

- Launcher валидирует `application_base_url`, optional `api_base_url`, `test_auth_demo_profile`, `seed_scenario_ref`; профили и seed получают извне, fail-fast при отсутствующих/некорректных обязательных значениях. Ни E2E файлы, ни config не содержат адресов или идентификаторов окружения. TG-030 подаёт те же inputs без правки тестов.
- Auth применяется только явно маркированным `TEST` профилем и test-only harness; production сборка не содержит секретов, тестового actor selector или обхода MAX auth. Сценарии работают с разрешёнными test actors и проверяют реальные backend права; A/B — разные actors одной роли, а не пятая role view.
- Каждый сценарий следует одному `Case ID`; смена роли, Result, remark, доработка и завершение не создают новый Case. Проверять серверные состояние, историю, текущие iteration/assignment/result и `allowed_actions`, а не только текст экрана. После success и `409` — authoritative refetch; нет optimistic workflow, stale auto-retry или auto-retarget.
- Happy path: Resident → UK → Contractor (явное принятие) → Result → Resident confirmation → UK completion. Confirmation сама не закрывает Case.
- Remark/rework: Result #1 → Resident remark → UK ReturnToRework → Result #2 → Resident confirmation → UK completion; новая итерация и старый Result сохраняются.
- Rework A→B отдельно: ReturnToRework создаёт N+1 ровно один раз; A теряет LIVE access; UK выбирает и отправляет B отдельными действиями; B явно принимает и продолжает работу при той же N+1. Initial rejection A→B отдельно: A отклоняет, UK назначает/отправляет B, B принимает; тот же Case и та же iteration.
- Comments/clarification проверяют общую ленту, допустимые ролевые сообщения и ответ на уточнение в нужном контексте. Четыре role views (`RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`) показывают только свои данные/действия. Repeat DemoRun создаёт новый Case, а прежний Case и его история неизменны; проверка старого Case выполняется только разрешённым test inspection path.
- Изменение разрешённой конфигурации влияет на новые Cases/маршрутизацию без переписывания исторического Case; две категории проходят одни экраны и lifecycle. Восстанавливаемая semantic/stale ошибка показывает ошибку без ложного успеха и позволяет исправить причину и повторить действие явно.
- Два Playwright projects: mobile viewport и web/desktop viewport. Доступность: smoke для primary controls/forms (семантические имена, labels, keyboard focus/operation). Screenshot/trace/video предпочтительно только при failure; артефакты и логи не содержат секретов.

## 8. Dependency requests

`@playwright/test` и реальный root `test:e2e` launcher/script потребуются: сейчас `package.json` содержит только `NO_SUITE_YET` заглушку, Playwright runner не закреплён как dependency. Запросить exact pin/lockfile и script wiring у владельца shared manifests через Integration Agent до implementation; TG-028 не правит эти файлы. Использовать согласованный TEST auth/MAX harness и seed interface; если нужная test-only точка входа отсутствует после завершения direct dependencies, передать конкретный blocker владельцам TG-027/TG-029, не создавать скрытую production точку входа.

## 9. Acceptance criteria

1. Launcher принимает четыре указанных input и отвергает неверный профиль; одинаковые E2E файлы проходят с injected local app и предоставленным позднее TG-030 compose profile без адресных правок.
2. Девять отдельных сценариев: happy path, remark/rework, rework A→B, initial rejection A→B, comments/clarification, four role views, repeat DemoRun, configuration effect, recoverable semantic/stale error. Проверяются `Case ID`, iteration, история, rights и отсутствие ложных workflow фактов.
3. Mobile и web/desktop projects проходят одинаковые обязательные потоки; accessibility smoke проходит для основных controls/forms; результаты не маркируются как доказательство MAX mobile/web.
4. TEST auth и artifacts не попадают в production build; screenshots/traces/video сохраняются предпочтительно при failure и без секретов. Diff ограничен разрешённым test scope.

## 10. Required tests

На будущей implementation branch: validation тесты launcher inputs (обязательные/optional/invalid/TEST-only), девять именованных E2E сценариев из §9, отдельные mobile/web projects, accessibility smoke. Запустить E2E против injected local app; после TG-030 повторить тот же suite через compose-provided inputs без изменения файлов. Проверить fail-only artifacts и отсутствие секретов, `git diff --check <implementation-base>`, `git diff --name-only <implementation-base>`. `NO_SUITE_YET` не считается успешным тестом; фактическая команда runner фиксируется после shared-script wiring.

## 11. Git / integration handoff

Authoring: `codex/tg-028-contract` от `CONTRACT_BASE_SHA`; commit/push только контракт с существующей человеческой Git identity. Вернуть полный SHA, self-check, local/remote SHA match и clean worktree. После завершения direct dependencies и отдельной canonicalization Implementation Agent получает новый stable `BASE_SHA`; Integration Agent объединяет и проверяет E2E с TG-030, создавая новый стабильный `main`. Сейчас main не менять; independent review для STANDARD по умолчанию не требуется.

## 12. Blocker protocol

Implementation запрещён, пока TG-022/023/024/025/027 не завершены на назначенной стабильной базе. При несовпадении `BASE_SHA`, необходимости записи вне scope, недоступном TEST harness/seed, несовместимых approved contracts или настоящем конфликте продуктовых правил остановить затронутую работу и передать точный blocker владельцу/Integration Agent. Для изменения Freeze/Spec сообщить `SPEC CONFLICT`; изменение допускается только по явному решению команды с записью в `docs/07_DECISIONS.md`.
