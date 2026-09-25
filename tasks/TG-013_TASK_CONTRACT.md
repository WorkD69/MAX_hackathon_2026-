# TG-013 — DEMO_MODE: DemoRun, actor switch и restore

## 1. Identity / BASE_SHA

`TASK_ID=TG-013`; `RISK_CLASS=CRITICAL`; `PRIMARY_OWNERSHIP=LANE-A`; `CONTRACT_BASE_SHA=e44344f19671763e184508d81c0fa83b372d893f` (`origin/main` при authoring); branch `codex/tg-013-contract`. Upstream: reviewed TG-008 contract `77724fa6ef8cc8556488a1f241aa523f32ceb3ed`, complete TG-010 implementation `6164045e3a6bd30ed857058af45b051024db8475`, reviewed TG-012 contract `405c932b0d9362840b3691cba1103e50ac1a19a3`. Сейчас разрешён только contract authoring; TG-013 implementation ждёт завершения **обеих** TG-008 и TG-012 implementations и собственного CRITICAL review PASS.

## 2. Goal

Задать server-enforced жизненный цикл current DemoRun, переключение ровно четырёх role views и восстановление одного run/primary Case в MAX mobile и web. Real validated MAX identity владеет run; effective synthetic actor выбирает сервер. Обычный повтор демо создаёт новый run и затем новый Case через `CreateCase`, сохраняя предыдущий Case и историю.

## 3. Canonical sources

Приоритет по `AGENTS.md`: `docs/01_PRODUCT_FREEZE.md` и `docs/02_PRODUCT_SPEC.md` §20, AC-010/055–058/076; `docs/03_ARCHITECTURE.md` §§12, 23; `docs/04_DATA_MODEL.md` §§25–26, 28–29, 35; `docs/05_INTERFACE_CONTRACTS.md` §§2–5, 10.1, 25, 29, 33; `docs/07_DECISIONS.md` ADR-017/021; `tasks/TASK_GRAPH.md` §TG-013; `tasks/TASK_TEMPLATE.md`. Upstream contracts/SHA из §1 задают seed actor catalog и common command kernel; TG-010 implementation задаёт действующий auth/session seam. При конфликте действует канонический источник, а не локальное удобство реализации.

## 4. Dependencies / unlocks

`Depends On: TG-008, TG-010, TG-012`; `Unlocks: TG-014, TG-027, TG-029`; `Parallel With: TG-018, TG-023, TG-024`. TG-010 implementation завершена; TG-008 и TG-012 имеют review PASS только для contracts. Поэтому authoring допустим, implementation TG-013 заблокирована до их implementation completion. Перед implementation сверить фактические upstream implementation SHA и назначенную base.

## 5. Allowed write scope

На этом этапе **только** `tasks/TG-013_TASK_CONTRACT.md`. Будущий scope TG-013: `apps/api/src/modules/demo/**`, DemoRun repositories/routes, server contractor actor resolver, primary Case binding service и targeted tests. TG-013 интегрируется с TG-010 auth/session bootstrap/read, TG-012 command kernel и будущим TG-014 `CreateCase` через явные interfaces; владельцы этих модулей согласуют shared-file изменения через Integration Agent.

## 6. Forbidden scope

Не менять `main`, canonical docs/graph, upstream contracts, код, DB migrations, seed, auth, frontend или review artifacts на contract stage. В runtime не принимать client `actor_alias`, `app_user_id`, `contractor_id`, organization или Case/run ID как authority переключения; не создавать пятый view и не объединять права ролей. Не создавать run при обычном bootstrap, не reset/reopen/delete старый Case или его события, не выставлять public reseed endpoint и не обходить TG-012 idempotency/security protocol.

## 7. Required behavior / invariants

- **Start DemoRun.** `POST /api/v1/demo/runs` принимает только canonical `{scenario_key:"primary-housing-demo"}` и обязательный `Idempotency-Key`. Principal — validated real `MAX_IDENTITY`, даже если effective actor отсутствует. При `DEMO_MODE=false` — `403 DEMO_MODE_DISABLED`; если exact real identity не имеет confirmed usable outbound `delivery_chat_id/type`, fail-closed до создания/архивации run по canonical error contract. В одной transaction по TG-012: reservation/replay, serialization по real MaxIdentity, archive только `status/archived_at` прежнего ACTIVE run, создание нового ACTIVE run с explicit notification recipient этой real identity и пяти `DemoRunActor` из TG-008 allowlist. Ответ `201` содержит new `demo_run_id`, `ACTIVE`, `primary_case_id:null` и ровно `RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`. Same-key retry даёт canonical replay; новый key создаёт новый run. Partial unique по identity и currentness revalidation удерживают максимум один ACTIVE run.
- **Repeat и primary bind.** Старт не создаёт Case. Resident затем вызывает обычный `CreateCase`: TG-014/TG-012 в одной transaction фиксируют immutable `Case.demo_run_id=current ACTIVE run` и `DemoRun.primary_case_id` только если NULL. Второй different-key primary Case в том же run получает `409 DEMO_PRIMARY_CASE_EXISTS` без второго Case/effects; same-key retry следует replay. Новый run получает новый Case ID; прежние Case, run-to-Case references, snapshots, events, results, attachments и history сохраняются. Archived/foreign run или Case скрыт/отклонён до раскрывающих stale/state ошибок; все protected reads, mutation и replay проверяют owner/current run и TG-011 authority.
- **Restore.** TG-010 bootstrap по fresh signed MAX context и `GET /api/v1/session` re-resolve единственный ACTIVE run по real identity и возвращают authoritative `demo_run_id`, nullable `primary_case_id`, real identity и effective actor/context. Reload и fresh bootstrap в mobile/web продолжают тот же run/Case; normal bootstrap не создаёт run. Действующий выбранный actor revalidated на каждом protected read и внутри mutation. Fresh bootstrap может вернуть `effective_actor=null` и потребовать явного role switch по Interface §2.3; клиент не восстанавливает права из сохранённой роли/alias. Token старого run после archive не даёт доступ к старому Case.
- **Actor switch.** `POST /api/v1/demo/session/actor` с обязательным `Idempotency-Key` принимает strict `{role_view:<одна из четырёх ролей>}`. Сервер проверяет `DEMO_MODE`, real session, owner/current ACTIVE run, `DemoRunActor` allowlist, active AppUser/RoleBinding и relevant access; Resident/UK views выбирают соответствующего предсозданного actor. Для Contractor view по current `primary_case_id`: current pending Assignment contractor, иначе current executor contractor, иначе TG-008 deterministic default только для pre-assignment entry, без Case access. A/B — два concrete actor одной роли; response `200` — новый signed token и authoritative session context. Роли и права не суммируются; текущая видимость Case определяется по выбранному actor и current run.
- **Races.** Concurrent starts одной identity сериализуются по MaxIdentity и TG-012 principal/key: same key replay, разные keys последовательно создают runs и оставляют один ACTIVE; каждый committed старый Case неизменен. Start против `CreateCase`/switch/restore проверяется под совместимым current-run lock/revalidation: ответ не выдаёт полномочия на archived run; уже выданный stale token отклоняется при следующем protected request. Два switch для одного ACTIVE run могут вернуть отдельные токены выбранных views; каждый токен содержит один actor и при использовании заново проверяется against current run/bindings, без глобального client-selected actor или union rights. Restore не смешивает `primary_case_id` одного run с ID другого.

## 8. Dependency requests

`NONE`. Использовать TG-008 deterministic actor catalog, TG-010 session seam, TG-012 kernel/idempotency и существующие contracts/DB constraints. Если фактические upstream interfaces потребуют shared-file/schema изменения, передать точный запрос владельцу через Integration Agent до implementation.

## 9. Acceptance criteria

На real PostgreSQL один validated MAX identity управляет максимум одним ACTIVE DemoRun. Start и повтор создают отдельные runs; новый run начинается с `primary_case_id=null`, первый `CreateCase` связывает свой Case, второй не создаёт Case. Старый Case/history остаётся без изменений и недоступен для mutation из нового run. Bootstrap/session восстанавливают текущие run/Case в mobile и web; switch принимает только role view, server выбирает A/B и выдаёт права одного actor. Disabled demo, foreign/archived scope и not-outbound-ready identity fail closed согласно canonical error/visibility order.

## 10. Required tests

Targeted API + real-PostgreSQL integration suite: точные четыре views/пять allowlisted actors; Start response и отсутствие Case; repeat `Run #1/Case A → Run #2/Case B` с неизменными A/history; concurrent same-key/different-key starts и один ACTIVE; atomic first primary bind, second-key `DEMO_PRIMARY_CASE_EXISTS`, rollback без orphan Case/bind; reload, mobile/web fresh bootstrap и `GET /session` с тем же current run/Case и без auto-create; switch strict `role_view` only, Resident/UK и pending Assignment A→B/current executor/default contractor resolution; request с forged alias/IDs/contractor или пятой ролью отвергнут; права A/B и ролей не union'ятся. Проверить `DEMO_MODE=false` `403`, foreign/archived run/Case hidden/denied, not-outbound-ready Start без mutation, stale token после нового run, switch/start/restore races и непротиворечивый context. После implementation выполнить targeted suite, `npm run typecheck`, `npm run build`, `npm test`, `git diff --check` и сообщить результаты.

## 11. Git / integration handoff

Contract branch `codex/tg-013-contract` от exact §1 base; commit/push только этого файла с существующей human Git identity, затем сверить local/remote SHA и clean worktree. После authoring — **one independent CRITICAL review в новом чистом чате** без review artifact в canonical repository и без canonicalize `main`. При `FIX_REQUIRED`: один exhaustive batch findings, один batch fix, затем targeted closure. Implementation branch/base назначать после PASS review и завершения TG-008 + TG-012 implementations; передать contract/upstream SHA и gates Integration Agent.

## 12. Blocker protocol

При `SPEC CONFLICT`, неверной base/upstream SHA, несовместимом session/kernel/seed contract, невозможности обеспечить atomic current-run/bind или выходе за write scope остановить затронутую работу и сообщить exact source и owner/Integration Agent. Не ослаблять server authority, history preservation или readiness guard локальным обходом.
