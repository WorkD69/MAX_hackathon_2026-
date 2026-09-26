# TG-018 — UK Admin configuration API, audit и locking

## 1. Identity / BASE_SHA

```text
TASK_ID = TG-018
RISK_CLASS = CRITICAL
PRIMARY_OWNERSHIP = LANE-B
CONTRACT_BASE_SHA = e44344f19671763e184508d81c0fa83b372d893f
CONTRACT_BRANCH = codex/tg-018-contract
UPSTREAM_TG007_CONTRACT_SHA = f760ed6703a1458dd1f01ef821b50afdd350e79e
UPSTREAM_TG012_CONTRACT_SHA = 405c932b0d9362840b3691cba1103e50ac1a19a3
```

База — полученный через fetch `origin/main`, сверенный с HEAD до authoring. Сейчас разрешён **только contract authoring**, без implementation и canonicalize main. Reviewed upstream contracts разрешают authoring; implementations pending. Будущая implementation получает отдельный актуальный `BASE_SHA` после completion TG-007 и TG-012 и PASS одного independent review.

## 2. Goal

Зафиксировать минимальный approved configuration API своей УК: reads, Organization update, House/Category create/update, result requirement/default contractor, contractor directory/binding и привязки предсозданных пользователей. Каждая успешная mutation атомарно сохраняет конфигурацию, обязательный append-only `ConfigurationChange` и successful `CommandExecution` через TG-012 kernel. Один canonical lock protocol сериализует затронутые configuration races, сохраняя исторический смысл существующих Case.

## 3. Canonical sources

Приоритет — `AGENTS.md`: `docs/01_PRODUCT_FREEZE.md` §§5, 12, 15; `docs/02_PRODUCT_SPEC.md` §§10, 18–19 и AC-044–054; `docs/03_ARCHITECTURE.md` §§9.4, 10.2, 11.3, 15–17; `docs/04_DATA_MODEL.md` §§1.4–1.5, 3–8, 9.2, 18, 29.4, 33; `docs/05_INTERFACE_CONTRACTS.md` §§2, 5, 24, 31, 33–34; `docs/07_DECISIONS.md` ADR-020. Governance: `tasks/TASK_GRAPH.md` §TG-018, `tasks/TASK_TEMPLATE.md`, `tasks/BACKLOG.md`, `docs/ORCHESTRATOR_HANDOFF.md`.

Обязательные seams: reviewed TG-007/TG-012 **на SHA из §1**, TG-011 policy boundary на fixed contract SHA `fcfe5af6c980d748c0cac632db2fe1a20a03f85e`, TG-002 `packages/contracts/src/configuration.ts` и canonical error schemas. TG-007 владеет persistence/DB constraints; TG-011 — policy; TG-012 — transaction, security/replay ordering и locking protocol. TG-018 их использует, не переопределяет.

## 4. Dependencies / unlocks

```text
Depends On: TG-007, TG-012
Unlocks: TG-026, TG-027, TG-029, TG-031
Parallel With: TG-013, TG-023, TG-024
IMPLEMENTATION_BLOCKED_UNTIL_TG007_TG012 = YES
```

Implementation gate открывается только после завершения **обеих implementations**, проверки их final SHA/совместимых interfaces и PASS independent review. Authoring, push или review контракта не означают completion TG-018 и не запускают unlocked задачи. Task Graph не менять.

## 5. Allowed write scope

**Сейчас — только `tasks/TG-018_TASK_CONTRACT.md`.**

Будущий implementation scope: `apps/api/src/modules/configuration/**`, принадлежащие TG-018 config repositories/routes и их targeted tests. Точные paths config repositories в `packages/db/src/**` и shared registration files фиксирует Integration Agent до implementation. TG-007 владеет audit schema/constraints/base repository, TG-012 — kernel/transactions, TG-011 — policy, TG-002 — shared schemas; их файлы не изменять конкурентно. TG-018 использует transaction-aware repositories в transaction kernel и пишет audit через TG-007 surface. Shared wiring передаётся владельцу через Integration Agent.

## 6. Forbidden scope

Не реализовывать код на authoring stage; не менять main, canonical docs, graph, upstream contracts, migrations, manifests/lockfile и чужие handlers/frontend. Не создавать invitations, passwords/recovery, offboarding, CRM, HR cabinet, AppUser lifecycle или arbitrary Premises/Resident access API. Не добавлять пятую роль, category-specific state machine, отдельную CategoryVersion, Case-history edit, generic Case PATCH, автоматическое назначение/отправку задания от default contractor или второй concurrency/idempotency framework.

Не принимать tenant selector/`organization_id` как выбор tenant, не переносить House/Category между организациями, не изменять глобальные Contractor/AppUser данные через own-organization binding API. Audit edit/delete API отсутствует; config API не создаёт CaseEvent и не меняет Case revision/history.

## 7. Required behavior / invariants

### API surface

Использовать exact routes и strict request/response schemas TG-002 / Interface §24. PATCH меняет только переданные whitelist fields, без сброса отсутствующих; unknown fields и пустые House/Category PATCH отвергаются schema validation.

| Endpoint | Обязательное поведение |
| --- | --- |
| `GET /api/v1/config/organization` | Базовые данные current own Organization. |
| `GET /api/v1/config/houses`, `/categories`, `/contractors`, `/users` | Только разрешённая own-scope конфигурация, включая доступные admin inactive записи для управления; contractor response содержит own OrganizationContractor, user response — только разрешённые bindings/access. Не выдавать полный глобальный справочник пользователей/чужие bindings. |
| `PATCH /api/v1/config/organization` | Только `name`; Organization identity/ownership и `active` не редактируются этим endpoint. |
| `POST /api/v1/config/houses`; `PATCH /api/v1/config/houses/{houseId}` | `address`, `display_label`, `active`; tenant выводится сервером. Нет смены owner или hard delete. |
| `POST /api/v1/config/categories`; `PATCH /api/v1/config/categories/{categoryId}` | `name`, `description`, `default_contractor_id`, `requires_premises_access`, `result_requirement`, `active`; server-owned `config_revision`, timestamps/updated actor поддерживаются по Data Model. |
| `POST /api/v1/config/contractors` | `display_name`; одна transaction создаёт Contractor и active OrganizationContractor текущей УК. |
| `PUT /api/v1/config/contractors/{contractorId}/binding` | `active`; bind/reactivate доступный existing directory contractor либо deactivate **только own OrganizationContractor**. Не менять global Contractor.active, чужую связь или исторические Assignment/Result. |
| `PUT /api/v1/config/users/{appUserId}/role-binding` | Только предсозданный доступный AppUser, canonical `role`, `contractor_id`, `house_ids`, optional `active` по TG-002. UK roles — current Organization, contractor role — соответствующий bound contractor; related UKHouseAccess только own Houses. Не менять чужие bindings. |
| `PUT /api/v1/config/contractors/{contractorId}/employees/{appUserId}` | `active`; create/reactivate/deactivate соответствующий CONTRACTOR_EMPLOYEE binding предсозданного доступного AppUser у contractor текущей УК. Не создавать AppUser. |

### Authorization и mapping

Reads и mutations — только active `UK_ADMIN` с server-selected effective context; никаких объединений прав всех bindings и доверия роли из payload. Organization определяется из текущей TG-011 policy. На reads права перечитываются до projection, на mutation — внутри transaction под совместимыми locks. Valid session не сохраняет отозванные права; demo obeys current run/actor boundary TG-011.

Foreign/absent/hidden target или linked target — canonical hidden `404` до revealing validation/replay detail; видимый own resource с forbidden action/non-admin — `403`; видимое invalid same-org mapping/inactive dependency — `422`, idempotency key conflict — `409` по canonical errors. Unknown user/House/Contractor IDs не становятся разрешёнными из-за их наличия в request. Bind existing Contractor разрешён только для directory target, доступного policy; доступность для binding не даёт LIVE Case rights. Связи ContractorEmployee не дают прав на чужую УК и не редактируют чужую конфигурацию; global Contractor/предсозданный user не считаются exclusively owned текущей УК. Не изобретать tenant column для contractor role: Data Model требует contractor_id и NULL organization_id; границу устанавливает TG-011.

Ровно четыре роли: `RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`, с shape Data Model §6.2. Resident binding не выдаёт произвольный ResidentPremisesAccess; использовать только preconfigured scenario access. Только `ResultRequirement = NONE | PHOTO | FILE`; текст результата всегда обязателен, NONE отменяет лишь дополнительные материалы. `default_contractor_id=null` снимает default; non-null требует active Contractor и active OrganizationContractor той же УК, перечитанные под locks.

### Command kernel и audit

Все mutations используют **тот же TG-012 kernel**, `APP_USER` principal effective admin, обязательный `Idempotency-Key`, canonical fingerprint, reservation/wait/replay, current authorization до protected duplicate decision и rollback/finalization. Проверяются requested и stored config contexts при различии. Non-Case command не получает искусственный Case/revision. Handler не реализует локальную reservation, replay cache, повторный policy порядок или CAS.

Каждый successful configuration write обязан записать `ConfigurationChange` **в той же DB transaction**: `config_change_id`, own `organization_id`, `entity_type`, UUID `entity_id`, `action`, nullable `before_data`, non-null JSON `after_data`, authoritative `actor_user_id`, `occurred_at`, FK `command_id` к текущей execution (§33 Data Model). Before — persisted состояние до изменения, прочитанное под locks; after — persisted результат, а не необработанный request. Creation имеет `before_data=null`; update/reactivation/deactivation — реальные before/after, включая active/mapping/requirement изменения. Составные эффекты (Contractor + OrganizationContractor, role binding + UKHouseAccess) должны быть полностью отражены в audit payload/records с одним command_id; не терять side effects и не подменять composite key строкой вместо canonical UUID entity_id. Конкретная representation использует согласованный TG-007 audit surface; несовместимость — blocker, без изменения schema здесь.

Нельзя вернуть successful write без persisted audit. Ошибка mutation/audit insert/kernel finalization откатывает **все** config effects, audit и reservation/success вместе. Same-key authorized replay возвращает stored status/body без повторного config write/audit; accepted same-value mutation не освобождается от обязательного audit. Append-only enforcement TG-007 сохраняется, audit не заменяется логом/outbox/CaseEvent.

### Locking и historical stability

Единый порядок: **principal/key reservation → Case rows, если применимо → Organization → House → Premises → Category → Contractor → OrganizationContractor → actor/access/binding rows по stable PK → child/domain writes**. Несколько строк одной family — stable PK order; duplicate с двумя Case — ascending case_id по TG-012. Config writer без Case не блокирует существующие Case и не берёт Case после config locks; не добавляет bulk rewrite. Блокировать все затронутые dependency/old/new target rows до изменения и удерживать до commit. Для create/bind с отсутствующей child row использовать existing parent scope locks того же protocol и canonical constraints; отсутствие строки не разрешает несериализованную проверку.

Config writer использует конфликтующие `FOR UPDATE`, а CreateCase/SelectContractor/SendAssignment — compatible `FOR SHARE`/эквивалент на участвующих mutable rows; проверки active и snapshot/selection/send выполняются в transaction под этими locks. Никаких advisory locks, mutex, второго framework или revision CAS вместо canonical row locks. Если dependent command первый удержал locks, он может committed effect до deactivation; writer ждёт. Если deactivation первая committed, последующая команда перечитывает состояние и не использует запрещённую конфигурацию, без частичных effects. Both orders проверяются контролируемыми races.

House/Category deactivation запрещает **новые** Case. Category/default/result/access configuration update влияет на новые snapshots; существующие Case сохраняют `category_name_snapshot`, `requires_access_snapshot`, `result_requirement_snapshot`, `default_contractor_snapshot_id`, `house_address_snapshot`, `premises_label_snapshot` и immutable историю. Category deactivation сама по себе не блокирует lifecycle существующего Case (Product Spec §§10.7, 18.4, AC-050 имеют приоритет над общим техническим wording Interface §24.9). SelectContractor/SendAssignment revalidate текущие Contractor/OrganizationContractor и применимые access/bindings; deactivated binding запрещает их использование в будущих selection/send, даже при старом default snapshot. Config не ретаргетит Selection/Assignment, не принимает/отзывает задания и не закрывает Case. Current authorization может измениться немедленно по TG-011, но snapshots/history от этого не мутируют.

## 8. Dependency requests

`DEPENDENCY_REQUESTS = NONE`. Новых packages/shared manifests не требуется. Использовать TG-002 schemas, TG-007 ConfigurationChange persistence и TG-012 kernel с TG-011 policy. Фактическая несовместимость audit identity/payload, transaction-aware repository или shared wiring передаётся владельцу и Integration Agent как конкретный interface/file request до affected implementation; не исправлять upstream в TG-018.

## 9. Acceptance criteria

Все endpoint из §7 реализуют только approved surface; UK_ADMIN own-org матрица и current policy соблюдаются на reads, writes и replay. Mutations не допускают tenant selection/чужие mappings. Ровно четыре роли и три result requirements; default не создаёт workflow effects. Каждый успешный write имеет complete before/after audit в общей transaction; audit failure исключает successful mutation. Kernel reused, lock order shared; races linearize по committed order. Existing Case snapshots/history стабильны и lifecycle по неактивной Category продолжается. Implementation завершение подтверждается §10, без расширения write scope.

## 10. Required tests

На implementation stage обязательны API tests и **real PostgreSQL** transaction/concurrency suites с управляемыми barriers, двумя sessions, обоими порядками выигрыша и проверкой committed rows; sleeps/mock/SQLite не заменяют evidence:

1. Admin/non-admin/cross-tenant matrix для **каждого read/write**; guessed path/linked IDs, foreign house/default contractor/user bindings, inactive/revoked selected binding при live token, normal/demo run scope, denied writes без effects/audit/success. Replay после revocation hidden/denied до stored response; requested/stored context mismatch hidden до key-reuse detail. Own reads не содержат чужих users/bindings.
2. Organization name update и whitelist rejection; House create/update/deactivate; Category create/update/deactivate; result requirement все `NONE/PHOTO/FILE`, unknown enum rejection; default set/clear, inactive/unbound/foreign rejection и отсутствие automatic Selection/Assignment. PATCH сохраняет omitted fields и old Case snapshots.
3. Contractor create + own binding atomicity; bind/reactivate/deactivate existing contractor, no global/foreign changes. Pre-created role/user binding, own UKHouseAccess, все четыре role shapes, fifth-role rejection; Resident не получает arbitrary access. Contractor employee binding/reactivation/deactivation, отсутствующий AppUser rejection без создания user, чужие bindings неизменны.
4. Same-transaction ConfigurationChange для **каждой mutation family**: creation null-before/non-null-after, update/reactivation/deactivation реальные before/after, actor/organization/command FK, полный composite effect; TG-007 append-only UPDATE/DELETE refusal. Отдельные fault injections после config write, на audit insert и после audit перед finalization дают ноль committed config/audit/reservation/success; retry того же key после rollback возможен.
5. Same-key parallel duplicate: одна mutation, один первоначальный audit effect set и один SUCCEEDED, identical stored status/body на authorized replay; changed payload даёт canonical conflict без writes. Different keys применяют serial config mutations с корректной цепочкой before/after.
6. Deactivate **House/Category vs CreateCase**, также Category requirement/default update vs CreateCase: writer-first запрещает новый Case при deactivation, command-first сохраняет coherent old snapshot до writer commit; при update snapshot целиком old/new, без смешения.
7. Deactivate **OrganizationContractor vs SelectContractor** и **vs SendAssignment**: writer-first dependency rejection, command-first один valid Selection/Assignment; после winner никакой silent retarget/partial effects. Включить applicable actor/access binding races и несколько old/new rows для stable PK ordering. Отсутствующая binding row/create/reactivate не обходит сериализацию.
8. Existing Case после House/Category/default/result config update/deactivate: snapshots, Case revision/state/iteration/pointers и history не меняются от config write; обычный lifecycle по inactive Category продолжается. SubmitResult проверяет **старый** result_requirement_snapshot и mandatory text; authorization отдельно revalidates текущие bindings по TG-011.

После implementation: targeted configuration API/PostgreSQL suites (точные paths закрепить в handoff), `npm run typecheck`, `npm run build`, `npm test`; ожидается PASS, upstream TG-007 persistence/TG-012 kernel/TG-011 policy regressions зелёные. На текущем authoring stage — 12-section/template/source/graph/self-check, `git diff --check`, exact single-file write scope; implementation tests **NOT_RUN**, их PASS не заявлять.

## 11. Git / integration handoff

Authoring: isolated ветка из §1, только contract file, self-check, commit/push **только `codex/tg-018-contract`** с существующей human Git identity. Вернуть full contract/base/upstream SHA, remote SHA match и clean worktree. Без main push/canonicalize. Затем **один independent CRITICAL review в отдельном чистом чате**, привязанный к exact contract SHA и upstream SHA; reviewer не реализует и не меняет canonical repository, review artifact не коммитится. PASS review не снимает implementation dependency gate. Интеграция и выдача будущей implementation базы — Integration Agent.

## 12. Blocker protocol

При неверном BASE_SHA, недоступном обязательном upstream, `SPEC CONFLICT`, несовместимых policy/kernel/persistence interfaces, отсутствии полной same-transaction audit representation, расхождении shared lock order либо выходе за write scope остановить затронутую работу и сообщить exact источник/расхождение владельцу и Integration Agent. Pending TG-007/TG-012 implementation — явный blocker **implementation**, не authoring. Не добавлять обходной framework/schema или расширять Product. При review `FIX_REQUIRED`: один полный batch findings → одно batch fix → только targeted closure, без нового полного review chain.
