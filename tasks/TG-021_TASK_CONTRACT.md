# TG-021 — Case list/details, status, activity и stale UX

## 1. Identity / BASE_SHA

`TASK_ID = TG-021`; `RISK_CLASS = STANDARD`; `Primary Ownership = LANE-C`.
`CONTRACT_BASE_SHA = 639f8c9ee02026741beb8aae723906dc9d6da9c6` (актуальный `origin/main` при authoring). Contract branch: `codex/tg-021-contract-inar`. Implementation branch: `codex/tg-021-implementation`, exact `TG020_IMPLEMENTATION_BASE_SHA = 7cafbf676b67ff16f02d4b5f64fc4ed65c9b044f`.

## 2. Goal

Дать всем четырём ролям общий читаемый список и карточку Case на основе server-authoritative role-filtered projection: понятный статус, ответственность и следующий шаг, разрешённая история и материалы, актуальные действия, обновление и явный stale UX. Экран остаётся пригодным в mobile и web MAX.

## 3. Canonical sources

Приоритет задаёт `AGENTS.md`. Продукт: `docs/01_PRODUCT_FREEZE.md` §§6–9; `docs/02_PRODUCT_SPEC.md` §§2, 4, 6–7, 24 (AC-029–038, AC-075). Техника: `docs/03_ARCHITECTURE.md` §§8, 11, 16; `docs/05_INTERFACE_CONTRACTS.md` §§4.2, 6–9, 29–30; `docs/07_DECISIONS.md` ADR-015/025. Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` (TG-021). Interfaces: публичные `packages/contracts/src/reads.ts` TG-002 и session context TG-020 (`tasks/TG-020_TASK_CONTRACT.md`, exact implementation SHA).

## 4. Dependencies / unlocks

`Depends On = TG-020 only`; `Unlocks = TG-022, TG-023, TG-024`; `Parallel With = TG-007, TG-011, TG-025`. TG-017 не является direct dependency: до появления backend reads использовать approved Interface Contracts и typed fixtures/mock transport, не воспроизводя server projection или authorization во frontend.

## 5. Allowed write scope

Contract: только `tasks/TG-021_TASK_CONTRACT.md`. Implementation: `apps/web/src/features/cases/read/**`, включая shared Case read components, transport seam, fixtures и тесты внутри этой директории. Потреблять публичные TG-002 contracts и TG-020 session context; предоставить feature-owned route/component seam для последующей центральной композиции TG-029.

## 6. Forbidden scope

Не менять `apps/web/src/features/session/**`, `demo/**`, `configuration/**`, центральный router, backend, `packages/contracts/**`, root manifests/lockfile, Product/Architecture/Interface semantics или файлы TG-025. Не загружать полный запрещённый Case ради CSS hiding, не реализовывать frontend state machine, permission inference, optimistic workflow mutation или workflow forms TG-022–024.

## 7. Required behavior / invariants

- Список использует только серверную ролевую проекцию; показывает loading, empty, error и refresh. Карточка показывает authoritative current snapshot, постоянный Case ID, semantic status для ровно восьми `CREATED`, `ACCEPTED_BY_UK`, `SENT_TO_CONTRACTOR`, `EXECUTION`, `AWAITING_RESULT_CHECK`, `REMARKS_REVIEW`, `REWORK`, `COMPLETED`, server responsibility и понятный следующий шаг. Не выводить авторизацию или переходы из state/role.
- Показывать только переданные сервером поля: разрешённые текущие назначение/исполнитель/результат, прошлые итерации и результаты из разрешённой history, единый activity feed, разрешённые initial/result/activity attachment metadata. Запрещённые поля отсутствуют в payload; frontend не скрывает их после полной загрузки.
- Activity следует `event_seq`: один `CaseEvent` даёт один item; comment/result/feedback и attachments обогащают свой event, не становятся второй записью того же факта. UI не сортирует по timestamp и не синтезирует business facts.
- `allowed_actions` приходят только из snapshot. Read layer предоставляет renderer registry/feature slots для TG-022–024, но не добавляет action по role/state и не считает массив границей безопасности. Backend повторно авторизует каждый command.
- После 409 показать понятный conflict/stale state, invalidate/refetch Case, activity и `allowed_actions`; не показывать успех, не делать automatic retry и automatic retarget. После refresh требуется новое явное действие пользователя. Поддержать manual refresh и refetch при возврате Mini App в foreground/focus; после actor switch не сохранять прежнюю read authority.

## 8. Dependency requests

`NONE`. Достаточны React, TanStack Query, React Router, TG-002 contracts и TG-020 session context. Shared manifests/lockfile не менять.

## 9. Acceptance criteria

1. Все восемь состояний читаемы с серверным responsibility/next step; list и details корректно показывают loading/empty/error/refresh и доступны в mobile/web layout.
2. Role-filtered fixtures показывают только разрешённые поля, историю, прошлые итерации/результаты и attachment metadata; forbidden full Case не запрашивается и не прячется CSS.
3. Activity сохраняет `event_seq` и one-event/one-activity; action registry отображает только server-provided `allowed_actions` без собственного вывода прав или переходов.
4. 409 оставляет действие невыполненным, сообщает об устаревании и обновляет projection; нет автоматического повтора или переназначения target. Manual/focus refresh работают.
5. Реализация остаётся в owned scope; backend TG-017 не нужен для локальной проверки с typed mock transport.

## 10. Required tests

На implementation branch: `npm run typecheck -w @max-smart-city/web`, `npm test -w @max-smart-city/web`, `npm run build -w @max-smart-city/web`, relevant root typecheck/tests и `git diff --check 7cafbf676b67ff16f02d4b5f64fc4ed65c9b044f`. Все без skip, `passWithNoTests` или подавления ошибок. Проверить all-8-state presentation; role-filtered snapshots; list loading/empty/error; details/permitted history/forbidden-field absence; `event_seq` и one-event/one-activity; only server `allowed_actions`; 409+refetch/no retry/no retarget; focus/manual refresh; mobile/web layout.

## 11. Git / integration handoff

После contract self-check перенести только этот файл без изменения semantics на свежий `origin/main`, перед push повторить fetch, без force; затем local `main = origin/main`. Implementation checkout создать отдельно от exact TG-020 implementation SHA, commit/push только `codex/tg-021-implementation`; не merge implementation в `main`. Передать Integration Agent полный SHA, результаты gates, write-scope diff, remote/local SHA match и clean worktree.

## 12. Blocker protocol

Остановить затронутую работу при `SPEC CONFLICT`, неверной exact implementation base, несовместимых approved interfaces или необходимости писать в чужой scope; сообщить конкретный blocker. Отсутствие TG-017 backend read models само по себе не blocker: использовать typed fixtures/mock transport в рамках approved contracts.
