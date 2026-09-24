# TG-020 — Web auth/session shell и DEMO_MODE controls

## 1. Identity / BASE_SHA

`TASK_ID = TG-020`; `RISK_CLASS = CRITICAL`; `Primary Ownership = LANE-C`.
`BASE_SHA = 0332bf029ab12a1217f1aef5f6bf0f26e6a2faca` (stable Wave-2 base). Перед implementation сверить `git rev-parse HEAD` с exact base; contract authoring branch: `codex/tg-020-contract`.

## 2. Goal

Подготовить frontend bootstrap реальной MAX Mini App, краткоживущую application session в памяти и управляемые сервером DemoRun/четыре role views в одной responsive shell. Результат TG-020 предоставляет session/role context и feature integration seam будущим экранам; workflow и права остаются server-authoritative.

## 3. Canonical sources

Приоритет из `AGENTS.md`. Продукт: `docs/01_PRODUCT_FREEZE.md` §6.5, §21–22; `docs/02_PRODUCT_SPEC.md` §§20–21, 22, INV-042/043/046/047, AC-055–058/076. Техника: `docs/03_ARCHITECTURE.md` §§6.1, 7.1, 8, 10, 12, 25; `docs/05_INTERFACE_CONTRACTS.md` §§1.3, 2–3, 5, 25; `docs/07_DECISIONS.md` ADR-015–017/025. Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` (TG-020 и ownership). Фактическая база: публичные `packages/contracts/src/**` TG-002 и `apps/web/src/app/**`, `platform/**`, `shell/**` TG-004.

## 4. Dependencies / unlocks

`Depends On = TG-002, TG-004`; `Unlocks = TG-021, TG-025`; `Parallel With = TG-006, TG-009, TG-010`. TG-010 не dependency: TG-020 опирается на уже approved HTTP/Zod interface contract; серверная реализация TG-010 подключается при интеграции. Server DemoRun semantics остаются за владельцем backend TG-013.

## 5. Allowed write scope

**На этой стадии:** только `tasks/TG-020_TASK_CONTRACT.md`.

**Для будущей implementation:** `apps/web/src/features/session/**`, `apps/web/src/features/demo/**` и только session/demo navigation в `apps/web/src/shell/**` (включая соответствующие тесты). Использовать foundation/PlatformAdapter TG-004 и публичный `@max-smart-city/contracts` TG-002. Feature route contribution допускается в owned feature paths; final central router registry принадлежит TG-029.

## 6. Forbidden scope

Не менять Product Freeze/Spec, Architecture, Interface Contracts, Task Graph, shared Zod contracts, backend auth/authorization/DemoRun, Case workflow screens и final central router. Не добавлять production login flow, пятый role view, client-side IAM, fake local session или optimistic workflow authority. На contract stage не менять manifests/lockfile и не создавать authoring/review/recheck artifacts.

## 7. Required behavior / invariants

- **MAX и session.** Raw signed `initData` поступает только через approved platform/Bridge adapter и передаётся как `init_data` в `POST /api/v1/auth/max`. Frontend не валидирует его как security decision, не логирует raw/token и не доверяет `initDataUnsafe`, client identity/role/contractor fields или `startapp` как authority. Server валидирует подпись и freshness, определяет identity/context, подписывает и проверяет short-lived Bearer session; Bot Token остаётся только на server.
- **Lifecycle.** Явные `pending/loading`, `authenticated/ready`, `auth/bootstrap error`, `retry`. Ошибка не заменяется фиктивной session. Успешный Bearer token хранится только в runtime memory: без `localStorage`, `sessionStorage`, `IndexedDB`, persistent cookie или иного persistent browser storage. После full reload — новый MAX bootstrap/auth; при истечении/ошибке session frontend возвращается к безопасному bootstrap/error flow. Direct browser без valid signed MAX context не может создать production MAX session; client-side признак Mini App не подменяет server validation.
- **DEMO_MODE.** Режим явно test-only, доступен только при разрешении canonical server configuration/context. Controls скрыты или disabled вне demo; изменение одной client variable не включает server-enforced switch. Один эксперт работает с одним current DemoRun/Case/history через ровно `RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`; Contractor A/B не являются отдельными views.
- **DemoRun и switch.** UI запускает `POST /api/v1/demo/runs` по canonical request/idempotency contract, восстанавливает current `demo_run_id` и `primary_case_id` из authoritative bootstrap/`GET /api/v1/session` context; reload сам не создаёт run. В `POST /api/v1/demo/session/actor` отправляется только разрешённый `role_view` (и обязательные HTTP headers), без actor/user/contractor identity или organization authority. Server выбирает concrete effective actor, включая contractor mapping, проверяет DemoRun, bindings и tenant context и выдаёт новый token/context. После success frontend заменяет in-memory session, invalidates/refetches relevant server state; прежние права и `allowed_actions` не сохраняются как authority.
- **Server-authoritative UI.** Frontend показывает role-filtered server data, но не решает authorization и не считает visibility или cached `allowed_actions` security boundary. После relevant mutations, switch и stale/conflict — invalidate/refetch authoritative state. До server success workflow state не меняется optimistically.

## 8. Dependency requests

`NONE`. Использовать имеющиеся React, Vite, TanStack Query, React Router и `@max-smart-city/contracts`. При доказанной потребности в новом пакете запросить его владельцу shared manifests/Integration Agent с обоснованием; эта стадия ничего не устанавливает.

## 9. Acceptance criteria

1. Trusted MAX path даёт server-issued session и отображает lifecycle; untrusted/direct-browser path не фабрикует production session, ошибка и retry наблюдаемы.
2. Token только в памяти; reload повторяет bootstrap/auth; Bot Token отсутствует во frontend bundle/config.
3. Demo controls включаются только server-authoritative demo context, помечены test-only; Start/restore возвращает текущий run и primary Case без локальной подмены истории.
4. Ровно четыре views; switch передаёт только `role_view`, получает server-issued effective context и refetches данные; старые `allowed_actions` не дают прав.
5. Session/demo feature seam работает с responsive TG-004 shell для mobile/web MAX; central router и будущие workflow screens не реализованы.

## 10. Required tests

На implementation branch выполнить `npm run typecheck -w @max-smart-city/web`, `npm test -w @max-smart-city/web`, `npm run build -w @max-smart-city/web`, `git diff --check 0332bf029ab12a1217f1aef5f6bf0f26e6a2faca`; все команды должны завершиться успешно. Обязательные targeted fixtures/checks:

1. Platform/Bridge adapter fixtures; trusted MAX bootstrap и direct-browser/untrusted negative path.
2. Auth success, bootstrap failure UI, retry; full reload вызывает новый bootstrap вместо восстановления Bearer token.
3. Token отсутствует в `localStorage`, `sessionStorage`, `IndexedDB`, persistent cookies и другом запрещённом storage; Bot Token отсутствует в frontend runtime bundle/config.
4. Start DemoRun, restore current DemoRun, restore `primary_case_id`/run context; ровно четыре role views.
5. Switch body содержит только permitted `role_view` без actor/user/contractor/organization identity; после switch выполнен invalidate/refetch relevant server state.
6. DEMO controls hidden/disabled вне `DEMO_MODE`; UI не использует cached `allowed_actions` как authority и не делает optimistic workflow mutation.
7. Responsive Mini App session/demo shell на mobile/web viewport в пределах ownership TG-020. Тесты не требуют экранов TG-021–TG-025.

## 11. Git / integration handoff

Contract: commit/push только `codex/tg-020-contract` от exact `BASE_SHA`; проверить diff только разрешённого файла, local/remote branch SHA и clean worktree. Использовать существующую человеческую Git identity, вернуть SHA и результаты self-check. Затем **один** independent contract review вне canonical repo; implementation — после review, integration в `main` выполняет отдельный Integration Agent. При `FIX_REQUIRED`: один exhaustive findings batch, один batch fix, targeted closure only.

## 12. Blocker protocol

Остановить затронутую работу при неверном `BASE_SHA`, выходе за write scope или реальном неразрешимом semantic conflict higher-order canonical sources; сообщить `SPEC CONFLICT` и запросить Product/Architecture decision без обходной реализации. Обычную формулировочную неоднозначность разрешать по canonical sources, не меняя semantics.
