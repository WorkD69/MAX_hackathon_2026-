# TG-008 — Deterministic seed и maintenance recovery

## 1. Identity / BASE_SHA

`TASK_ID = TG-008`; `TYPE = DATA`; `EXECUTION_CLASS = A — Implementation`; `RISK_CLASS = CRITICAL`; `PRIMARY_OWNERSHIP = LANE-B`.

`CONTRACT_BASE_SHA = 611acf21240d36fc933b843022a26530f5a97526` — проверенный `origin/main` при authoring. `UPSTREAM_TG007_CONTRACT_SHA = f760ed6703a1458dd1f01ef821b50afdd350e79e` (`REVIEW_STATUS = PASS`). Ветка контракта: `codex/tg-008-contract`. Этот SHA не является implementation base: TG-007 implementation ещё заблокирована до final TG-006 verification.

## 2. Goal

Зафиксировать воспроизводимый bootstrap минимального synthetic demo tenant после migrations и отдельный ограниченный team-only recovery command. Обычный повтор демо создаёт новый `DemoRun` и новый Case через продуктовые команды, сохраняя старый Case и его историю. Этот документ задаёт требования к будущей реализации; текущий этап не изменяет runtime, БД или миграции.

## 3. Canonical sources

Приоритет — `AGENTS.md`; продуктовая семантика — `docs/01_PRODUCT_FREEZE.md` §§ 6, 15 и `docs/02_PRODUCT_SPEC.md` §§ 18–20, AC-055–059. Технические границы — `docs/03_ARCHITECTURE.md` §§ 12, 23; `docs/04_DATA_MODEL.md` §§ 3–8, 35–36; `docs/05_INTERFACE_CONTRACTS.md` §§ 3.3, 25, 35; `docs/07_DECISIONS.md` ADR-017/021/022/024. Governance — `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` § TG-008. Upstream: reviewed `tasks/TG-007_TASK_CONTRACT.md` на указанном SHA. При расхождении продуктовых правил действует приоритет `AGENTS.md`.

## 4. Dependencies / unlocks

`Depends On = TG-007`; `Unlocks = TG-013, TG-026`; `Parallel With = TG-012, TG-019, TG-022`. Contract authoring разрешён по reviewed TG-007 contract. Implementation TG-008 запрещена до завершённой TG-007 implementation, которая сама ждёт final TG-006 verification; будущая implementation должна получить точный завершённый TG-007 implementation SHA и сверить его с `git rev-parse HEAD`. TG-013 владеет `Start DemoRun`, созданием `DemoRunActor` для каждого нового run и server-side выбором contractor actor; TG-008 предоставляет стабильные fixtures и разрешённый каталог акторов.

## 5. Allowed write scope

Сейчас — только `tasks/TG-008_TASK_CONTRACT.md`. Будущая implementation после § 4: `packages/db/src/seed/**`, `apps/api/src/maintenance/**` и относящиеся только к seed/maintenance scripts; целевые тесты внутри этих путей. TG-008 владеет стабильным seed CLI contract, который позднее вызывает TG-030. Shared manifests/lockfile, migrations и чужие модули требуют отдельного ownership route, но не входят в этот контрактный commit.

## 6. Forbidden scope

Не менять Product Freeze/Spec, Architecture, Data Model, Interface Contracts, Task Graph, schema/migrations TG-005–007, `apps/api/src/modules/demo/**` TG-013, domain command kernel TG-012, outbox TG-019, frontend, Docker TG-030 или real MAX identity binding. Не создавать product HTTP endpoint/action для reseed, не откатывать migrations, не удалять и не перезаписывать real/non-synthetic tenant data, не обходить DB immutability ради очистки, не выдавать synthetic сведения за CRM/ГИС ЖКХ. На contract stage запрещены implementation code, scripts, dependency changes и review artifact.

## 7. Required behavior / invariants

- **Детерминированный каталог.** Один явно помеченный synthetic tenant с одной УК, active house и premises; synthetic Resident, UK Employee, UK Admin и сотрудники Contractor A/B — пять отдельных `AppUser` с `is_synthetic=true`. Ровно четыре Product role values: `RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`; A/B — два актора одной contractor role view. Две active Category, обе в этой УК, с корректными default contractor mappings; обе contractor organizations доступны УК через `OrganizationContractor`. Resident имеет `ResidentPremisesAccess`, UK actors — нужный `UKHouseAccess`/organization scope, contractor employees — binding на своего contractor. Все связи active и tenant-consistent.
- **Стабильные идентификаторы.** Зафиксировать в seed manifest постоянный namespace/version и business keys: `demo.uk`, `demo.house`, `demo.premises`, `demo.resident`, `demo.uk_employee`, `demo.uk_admin`, `demo.contractor_a`, `demo.contractor_a_employee`, `demo.contractor_b`, `demo.contractor_b_employee`, `demo.category_a`, `demo.category_b`, включая ключи role/access и organization-contractor mappings. Каждому ключу соответствует постоянный UUID или постоянная составная identity согласно schema; lookup не зависит от порядка вставки, sequence, случайного PK или display name. Изменение ключей/IDs является миграцией fixture contract, а не побочным эффектом повторного seed. Человекочитаемые имена и адрес явно обозначены как вымышленные.
- **Idempotent normal seed.** После migrations первый запуск создаёт только отсутствующие owned fixtures, второй оставляет их логическое состояние, IDs, bindings, timestamps/config revisions и исторические данные без изменений. Допустимое целевое восстановление owned fixture полей не должно создавать semantic duplicates или перетирать конфигурацию/историю, изменённую продуктовой командой; конфликт ID/business key с non-synthetic или чужим tenant, неоднозначная принадлежность либо нарушенная связь дают fail-closed ошибку. Seed не создаёт `DemoRun`, `Case`, завершённый baseline Case, `CaseEvent`, внешние identity/chat bindings или fake integration facts.
- **Actor allowlist.** Manifest определяет пять допустимых `(role, actor_alias, app_user_id)` и стабильного default contractor actor для входа до Assignment. `DemoRunActor` принадлежит конкретному run и создаётся TG-013 при `Start DemoRun` из этого каталога; bootstrap seed не создаёт фиктивный run и не даёт A/B дополнительных role views. Выбор A/B для действующего Case выполняет backend по current Assignment/executor, а не frontend alias; default actor сам по себе не получает Case access.
- **Repeat preservation.** Обычный `Start DemoRun` архивирует только статус прежнего run, создаёт новый run без Case; Resident выполняет обычный `CreateCase`, получая новый Case ID и новую primary binding. Seed, bootstrap и normal repeat не reset/reopen/delete старый Case, не переписывают snapshots, events, results, attachments или run-to-Case references. Старый run/Case остаётся historical и недоступен для mutation из нового current run.
- **Bounded maintenance.** Отдельная документированная team-only CLI/hosting command, без product HTTP route. До любой DB mutation она требует explicit non-production environment, `DEMO_MODE=true`, точный synthetic tenant ID/marker из seed manifest и однозначное доказательство synthetic ownership всей затрагиваемой связи; production, неизвестный environment, `DEMO_MODE=false`, missing/ambiguous marker, non-synthetic tenant либо затрагивание real identity/non-synthetic rows отвергаются. Scope повторно проверяется при записи; действие атомарно, при ошибке не оставляет частичного recovery. Recovery ограничена fixtures и безопасными synthetic run artifacts; если очистка затронет Case/history, immutable DB facts, чужие tenant links или real MAX identity, команда отказывает, а не расширяет scope или отключает constraints. Не выполняет rollback migrations. Фиксирует явное audit/log warning с target и итогом, без PII/secrets.

## 8. Dependency requests

`DEPENDENCY_REQUESTS = NONE`. Использовать существующие PostgreSQL/Kysely и typed environment configuration TG-003; shared manifests/lockfile не править. Если после TG-007 обнаружится необходимость новой schema или shared dependency, остановить затронутую реализацию и передать конкретный запрос владельцу через Integration Agent.

## 9. Acceptance criteria

На migrated PostgreSQL минимальный tenant находится по стабильным ключам/IDs; есть ровно пять synthetic actors и четыре role views, A/B имеют разные contractor bindings, две категории и необходимые active mappings/access. Двойной normal seed не меняет логическое состояние и не создаёт дублей; конфликт с non-synthetic данными не маскируется. Нет baseline Case и вымышленных MAX/CRM/ГИС связей. TG-008 seed/recovery не изменяет прежний Case и его business/history facts; интегрированный новый run/new Case проверяет владелец TG-013. Maintenance доступна только команде в разрешённой среде и отвергает production, disabled demo и non-synthetic/ambiguous scope до записи; не выставляется в public routes и не откатывает migrations.

## 10. Required tests

После implementation на реальном PostgreSQL выполнить целевой seed/maintenance suite, затем `npm run typecheck`, `npm run build`, `npm test` и `git diff --check <TG007_IMPLEMENTATION_BASE_SHA>` без skip/`passWithNoTests`. Suite обязан доказать:

1. Seed дважды: одинаковый нормализованный snapshot строк, IDs, active bindings, timestamps/revisions; deterministic lookup каждого business key; no semantic duplicates.
2. Ровно четыре role values и пять actors; отдельные A/B contractor fixtures и правильные organization-contractor/default-category mappings; две active categories; resident/UK/contractor access shapes и allowlist template.
3. Нулевой baseline Case, в частности ни одного `COMPLETED`; нет real PII, fake CRM/ГИС facts и подставных outbound-ready MAX identity/chat bindings.
4. На fixture с существующим `Run #1/Case A` повторный seed не меняет Case A, его snapshots/history и run-to-Case binding; fixture с отдельным `Run #2/Case B` подтверждает, что стабильные actors/config обслуживают оба run без reset старого Case. Реальный `Start DemoRun → CreateCase` и новый ID проверяются интеграционными тестами TG-013; TG-008 не ждёт TG-013 для своего closure.
5. Maintenance: production, `DEMO_MODE=false`, неизвестная среда, non-synthetic/ambiguous tenant и смешанные real/synthetic links дают отказ до mutation; после каждого отказа DB snapshot неизменен. Разрешённый bounded recovery затрагивает только разрешённый synthetic scope, при ошибке откатывается целиком, пишет audit/log warning и не выполняет migration rollback.
6. Route inventory/HTTP probe: maintenance command не зарегистрирована как публичный или product API endpoint; обычная авторизация эксперта не запускает recovery.

## 11. Git / integration handoff

Контракт: `codex/tg-008-contract` от указанного `CONTRACT_BASE_SHA`; commit/push только этого файла с существующей human Git identity, затем сравнить local/remote SHA и clean worktree. Один independent review контракта после authoring, без review artifact в репозитории и без canonicalize `main`. При `FIX_REQUIRED` — один полный пакет замечаний, одно пакетное исправление, targeted closure. Передать Integration Agent contract SHA, base SHA, review status и границы; implementation branch/base назначать только после завершения TG-007 и review TG-008. Не push в `main`.

## 12. Blocker protocol

При `SPEC CONFLICT`, неизвестном/неверном exact implementation base, незавершённом TG-007, невозможности доказать synthetic scope, конфликте fixture IDs с real data, необходимости менять чужой файл/schema или обходить immutable facts остановить затронутую работу и передать конкретный blocker владельцу. Contract authoring не снимает dependency gate и не разрешает maintenance mutation до отдельной implementation и её проверок.
