# TG-025 — UK Admin configuration UX

## 1. Identity / BASE_SHA

`TASK_ID = TG-025`; `RISK_CLASS = STANDARD`; `Primary Ownership = LANE-D`.
`CONTRACT_BASE_SHA = 56f03d8d97757d70877d1da1b7e9c351f0659136` (actual `origin/main` при authoring). Implementation TG-020: `7cafbf676b67ff16f02d4b5f64fc4ed65c9b044f`. Перед implementation сверить назначенную Integration Agent стабильную базу с `git rev-parse HEAD`; SHA authoring не подменяет будущую implementation base.

## 2. Goal

Минимальный раздел «Настройка организации» для администратора УК: менять разрешённые данные своей Organization, дома, категории и маршрутизацию, подрядчиков и связи, роли/привязки заранее созданных пользователей. UI пригоден для mobile и web MAX без CRM/HR-функций.

## 3. Canonical sources

Приоритет по `AGENTS.md`: `docs/01_PRODUCT_FREEZE.md` §§6, 12–13; `docs/02_PRODUCT_SPEC.md` §§10, 18–19, 24.6–24.7; `docs/03_ARCHITECTURE.md` §§10.2, 16.4; `docs/05_INTERFACE_CONTRACTS.md` §§2–3, 24, 31; `docs/07_DECISIONS.md` ADR-015/020/027. Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md`. Typed wire contracts: `tasks/TG-002_TASK_CONTRACT.md`, `packages/contracts/src/**`; session seam: reviewed `tasks/TG-020_TASK_CONTRACT.md` и указанный implementation SHA.

## 4. Dependencies / unlocks

`Depends On = TG-020`; `Unlocks = TG-028, TG-029`; `Parallel With = TG-007, TG-011, TG-021`. TG-018 реализует backend configuration позже и **не** является direct или hidden dependency TG-025: до live integration frontend может использовать утверждённый Interface Contract §24, TG-002 types и typed fixtures. Live composition backend/UI принадлежит TG-029.

## 5. Allowed write scope

На стадии authoring: только `tasks/TG-025_TASK_CONTRACT.md`. Для будущей implementation: `apps/web/src/features/configuration/**`, включая tests и feature route contribution. Central router/navigation registry и shared files принадлежат Integration Agent/TG-029; изменения вне feature scope требуют отдельной передачи владельцу.

## 6. Forbidden scope

Не менять Product Freeze/Spec, архитектурную и wire semantics, Task Graph, backend TG-018, shared contracts, central router, root manifests/lockfile и исторические Case snapshots. Не вводить tenant selector, регистрацию, invitations, passwords/recovery, offboarding, CRM/HR cabinet, новые роли, новый lifecycle или настройки за пределами §24. На этой стадии не писать implementation, review artifacts и не canonicalize contract.

## 7. Required behavior / invariants

- Доступный UI показывает own-Organization настройки только при server-authoritative session/projection `UK_ADMIN`. Для остальных ролей поверхность скрыта/недоступна; frontend visibility и client role не являются authorization. `403`, скрывающий foreign target `404`, semantic `422` и conflict `409` отображаются без выдачи чужих данных.
- По Interface §24 доступны: update имени Organization; add/update House; add/update Category с описанием, `requires_premises_access`, `active`, `default_contractor_id` и `result_requirement`; add Contractor с `OrganizationContractor` binding, bind/reactivate/deactivate существующего; роли и разрешённые bindings pre-created AppUser, включая contractor employee и own-scope UK house access. Не создавать AppUser и resident premises access через этот UI.
- Ровно четыре роли: `RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`. Ровно три требования к результату: `NONE` («ничего дополнительно»), `PHOTO` («фото»), `FILE` («файл»); текст результата остаётся обязательным в Case lifecycle. Подрядчик по умолчанию выбирается только из допустимых привязанных подрядчиков; решение о назначении/отправке Case остаётся в workflow.
- При изменении/деактивации copy ясно поясняет действие на новые Cases или будущие действия по canonical semantics. Существующие Cases сохраняют snapshot, состояние и историю; frontend не предлагает редактировать старые Case или мигрировать их молча.
- Формы/мутации имеют `pending`, success, validation error, server semantic error и retry где уместно. После success — authoritative refetch; config не показывается как authoritative optimistic mutation. Payloads и idempotency соответствуют Interface §24/TG-002, без `organization_id` или tenant authority от клиента.

## 8. Dependency requests

`NONE`. Использовать React, TanStack Query, React Router, TG-002 contracts и TG-020 session context. Новые packages и правки root manifests/lockfile не требуются; при доказанной необходимости запросить владельца shared files через Integration Agent.

## 9. Acceptance criteria

1. `UK_ADMIN` своей Organization может без правки кода добавить второй дом, категорию и подрядчика; изменить поля категории, default routing, contractor binding и разрешённые роли/привязки pre-created users.
2. Non-admin не получает configuration surface; server-denied и foreign-tenant responses не открывают данные и не превращаются в локальное «разрешение».
3. Выборы ограничены четырьмя ролями и `NONE | PHOTO | FILE`; нет tenant selector, HR/CRM и управления историческими Case.
4. Объяснение deactivation/изменения сохраняет historical Case stability; pending/success/error/refetch наблюдаемы на mobile и web.

## 10. Required tests

На implementation branch: `npm run typecheck -w @max-smart-city/web`, `npm test -w @max-smart-city/web`, `npm run build -w @max-smart-city/web`, `git diff --check <implementation-base>`; все команды должны завершиться успешно. Targeted проверки:

- UK_ADMIN visibility, non-admin hidden/denied; cross-tenant `404`, `403`, semantic `422` и `409` без чужой projection.
- Organization, House, Category/result requirement, default contractor, contractor binding и pre-created role/binding формы и exact §24 payloads; нет client `organization_id`.
- Ровно четыре роли и точные `NONE | PHOTO | FILE`; невалидные значения исключены.
- Deactivation copy; нет existing-Case edit controls, invitations/passwords/offboarding/CRM/tenant-selector controls.
- Mobile/web usability; pending, success, validation/server errors, retry и authoritative refetch после success без optimistic config authority.

## 11. Git / integration handoff

Authoring: `codex/tg-025-contract` от `CONTRACT_BASE_SHA`; commit/push только разрешённого файла, проверить diff, local/remote SHA и clean worktree, вернуть SHA и self-check. После отдельной canonicalization допускается implementation на назначенной стабильной базе. Integration Agent объединяет TG-025 с TG-018 и router в TG-029; в этом prompt main не менять и independent review не проводить.

## 12. Blocker protocol

Остановить затронутую работу при неверной базе, выходе за write scope или реальном конфликте canonical sources; сообщить `SPEC CONFLICT` ответственному без обходной реализации. Если будущая integration выявит несовместимость §24/backend, передать конкретный факт владельцам TG-018/TG-029, не превращая TG-018 в скрытую зависимость и не меняя продукт самостоятельно.
