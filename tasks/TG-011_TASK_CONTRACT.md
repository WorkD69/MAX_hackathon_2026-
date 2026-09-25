# TG-011 — Per-request authorization и role isolation

## 1. Identity / BASE_SHA

`TASK_ID=TG-011`; `RISK_CLASS=CRITICAL`; `CONTRACT_BASE_SHA=639f8c9ee02026741beb8aae723906dc9d6da9c6` (actual `origin/main` после fetch); contract branch `codex/tg-011-contract`; owner `LANE-A`. Этап: **только authoring**. TG-010 implementation dependency: `6164045e3a6bd30ed857058af45b051024db8475`; `WAVE_INTEGRATION_READY=YES`.

## 2. Goal

Зафиксировать backend policy layer, которая на каждом защищённом read и внутри каждой mutation заново вычисляет права из authoritative текущих данных. Результат policy — решение о доступе, scope и видимости для query/read/command consumers; эта задача не исполняет доменные команды и не строит полный sensitive объект для последующей маскировки.

## 3. Canonical sources

`AGENTS.md`; `docs/01_PRODUCT_FREEZE.md` §6; `docs/02_PRODUCT_SPEC.md` §§2, 6.3, 22.5, 23–24; `docs/03_ARCHITECTURE.md` §§10–12, 25; `docs/04_DATA_MODEL.md` §§6, 9–12, 29.3, 34–35; `docs/05_INTERFACE_CONTRACTS.md` §§2–3, 6–8, 26, 29–31; `docs/07_DECISIONS.md` ADR-015/017; `docs/08_PROJECT_STATE.md`; `docs/ORCHESTRATOR_HANDOFF.md`; `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` §TG-011; `tasks/TG-002_TASK_CONTRACT.md`, `tasks/TG-005_TASK_CONTRACT.md`; fixed `tasks/TG-010_TASK_CONTRACT.md` на ветке `codex/tg-010-contract` и TG-010 implementation SHA выше. Приоритет источников — по `AGENTS.md`; утверждённую семантику не менять.

## 4. Dependencies / unlocks

`Depends On: TG-010` **only**; `Unlocks: TG-012`; `Parallel With: TG-007, TG-021, TG-025`. TG-002/005 — canonical sources и транзитивный foundation, не новые direct dependencies.

## 5. Allowed write scope

Сейчас — **только** `tasks/TG-011_TASK_CONTRACT.md`. После одного independent review будущая implementation может писать `apps/api/src/modules/authorization/**` и принадлежащие TG-011 policy fixtures/tests. Consumer wiring/shared composition согласовывается с владельцами соответствующих задач; не расширять whitelist молча.

## 6. Forbidden scope

Не менять `main`, Task Graph, Product/Architecture/Data Model/Interface semantics, TG-010 auth implementation, root manifests/lockfile и TG-012 command kernel. Не вводить пятую Product role, historical contractor cabinet, клиентский tenant selector, frontend/CSS authorization или новые бизнес-состояния. Нельзя авторизовать по client role/actor/contractor ID, знанию Case ID, `startapp`, stale session-side role, объединению нескольких bindings или UI visibility.

## 7. Required behavior / invariants

- **Текущий principal.** Сначала проверить TG-010 signed Bearer и server-bound real identity/effective actor. Затем для **каждого protected read** заново загрузить `AppUser.active`, exact selected `UserRoleBinding.active`, его organization/contractor и relevant active access rows; для mutation — внутри transaction после Case lock и до раскрывающих business errors (`Data Model` §§29.3, 34). Token хранит идентификаторы context, а не права до expiry. Отзыв/деактивация любого необходимого binding/access отрицает **следующий request при ещё действующем token**. Не делать fallback на другой binding или union. Normal mode: использовать ровно selected binding из signed session; TG-010 ambiguous active bindings fail closed. Demo: до server-selected effective actor Case-доступа нет; после switch TG-013 выбранный active binding конкретного allowlisted actor должен быть однозначен и revalidated, иначе fail closed. Demo role view не выбирает contractor alias/ID на клиенте.
- **Общие фильтры.** Policy применяет совместно role, organization, house, premises, Case, current iteration/Assignment/executor и, в demo, exact `Case.demo_run_id == session.demo_run_id`, current `ACTIVE` DemoRun с owner = real MAX identity и `DemoRunActor` allowlist. На list фильтры действуют до выборки/projection; на snapshot, activity, attachments/download и mutations — до выдачи данных/эффекта. Foreign/guessed tenant, Case, attachment и cross-run ID не дают доступа через знание ID. Состояние Case не расширяет principal scope.
- **Resident policy (`RESIDENT`).** Только `Case.resident_user_id = effective app_user_id` и active `ResidentPremisesAccess` к exact `Case.premises_id` в соответствующих house/organization. Собственные Case list/snapshot, разрешённые материалы, комментарии/feedback только в canonical state/current Result/iteration context; ни UK/contractor actions, ни чужие Cases. Exact contractor `reject_reason` и внутренние UK/contractor события не входят в resident projection; после отказа — canonical нейтральный смысл.
- **UK Employee policy (`UK_EMPLOYEE`).** Только `Case.organization_id = binding.organization_id` и active `UKHouseAccess` к `Case.house_id`; разрешённая рабочая история и state-specific UK actions. Проверять tenant принадлежность house/premises и related resources; employee не получает admin configuration authority.
- **UK Admin policy (`UK_ADMIN`).** Employee work rights и configuration только **своей** `binding.organization_id`; для Case read/admin работы допустимый Data Model §6.4 computed admin rule покрывает дома этой организации без отдельного `UKHouseAccess`, но никогда чужую организацию. Никакого global scope или tenant selector.
- **Contractor policy (`CONTRACTOR_EMPLOYEE`).** Binding задаёт exact contractor, а не все assignments организации. `selected` без отправки: **нет LIVE Case list/snapshot/attachments/mutation**. Только exact current **sent/pending Assignment** этого contractor, ещё не accepted, даёт limited acceptance context Product Spec §2.4, initial attachments и ровно accept/reject own current assignment. Только **accepted current Assignment** и current executor того же contractor дают executor read и разрешённые state-specific working comments/result/material actions; accepted не означает право закрыть Case. Требуется relevant active `OrganizationContractor`, где применимо. Отказ/переназначение немедленно удаляет old contractor из LIVE list и запрещает snapshot, activity/attachment/download и mutation; исторический Assignment/причина отказа не создают read-only кабинет. Повторно полученный valid current Assignment проверяется как новый current context, а не по старой истории.
- **Visibility и ordering.** Policy возвращает scope/visibility descriptors для server query/read projections и `allowed_actions`: pending context, executor context и ролевые поля/события выбираются **до** сериализации, без полного sensitive object с последующим frontend/CSS скрытием. `403` — действие запрещено по видимому own resource; absent/foreign/invisible — canonical hidden `404` (`Interface` §31). После Case load/lock проверить principal + tenant/resource/run visibility **до** terminal/state/stale/assignment-status/forbidden semantic detail; hidden resource никогда не сообщает `TERMINAL_CASE`, `STALE_*` или причину отказа. Для видимого ресурса последующие stale/terminal checks принадлежат TG-012/commands, не TG-011.

## 8. Dependency requests

`NONE`. Использовать existing stack/interfaces TG-002/005/010; на contract stage manifests/lockfile не менять. Если integration требует shared wiring, запросить владельца файла через Integration Agent, не расширяя TG-011 scope.

## 9. Acceptance criteria

Policy на каждом request выдаёт decision и применимые scope/visibility descriptors без stale rights; отозванный binding/access блокирует следующий request при live token. Ровно четыре Product roles (`RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`); pending/current executor — **policy states**, не роли. Resident/UK/admin tenant границы, три contractor стадии, немедленная потеря LIVE прав old contractor и hidden-404 ordering соблюдены. TG-011 не мутирует Case/domain facts; consumers могут применить policy до projection/command validation.

## 10. Required tests

- Полная role × Case state × tenant/house/premises/run × current Assignment/executor matrix, включая видимые/невидимые `allowed_actions` и field/event projections по Interface §30.
- Resident own/foreign premises и own/foreign Case; UK Employee own/foreign organization и allowed/forbidden house; UK Admin all own-org houses и foreign-org denial; normal/demo guessed cross-tenant, cross-run Case/attachment IDs.
- Contractor selected-only без доступа; sent/pending — только acceptance context + accept/reject; accepted current executor; old contractor после rejection/reassignment: **list, snapshot, activity, attachment/download и mutation denied**, даже с историческим Assignment; повторно назначенный contractor — только от нового current fact.
- Revoked/deactivated AppUser, selected binding, premises/house access, organization/contractor binding, `OrganizationContractor`, DemoRun/actor: следующий read и mutation denied при valid session; multiple active bindings — exact selection/fail closed, no union/fallback.
- Hidden resource ordering: foreign/invisible Case/attachment всегда canonical `404` раньше stale/terminal/assignment status/semantic detail; visible own forbidden action — `403`; resident response не содержит exact `reject_reason`. Тестировать policy и consumer-facing boundary с существующими TG-002 schemas; targeted tests, `npm run typecheck`, `npm test` должны завершаться успешно на implementation stage.

## 11. Git / integration handoff

Authoring: exact `CONTRACT_BASE_SHA`, isolated checkout `codex/tg-011-contract`, только этот файл, commit/push **task branch only** с существующей human Git identity; вернуть полный `CONTRACT_SHA`, remote SHA, clean status и self-check. Затем **ONE independent CRITICAL contract review**, только после него implementation и wave integration. При `FIX_REQUIRED`: один exhaustive batch findings → один batch fix → targeted closure only. Не создавать review artifact в canonical repository.

## 12. Blocker protocol

При неверной базе, неоднозначном выборе effective binding/context, несовместимости TG-010 signed context с обязательной per-request revalidation, конфликте canonical sources или выходе за write scope остановить затронутую работу и сообщить exact источник/расхождение ответственному; не изобретать policy и не менять TG-010 auth. `SPEC CONFLICT` решается командой по `AGENTS.md`/ADR, не обходом в implementation.
