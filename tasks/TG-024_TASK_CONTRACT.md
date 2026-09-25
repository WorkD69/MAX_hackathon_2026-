# TG-024 — Contractor acceptance, work и Result UX

## 1. Identity / BASE_SHA

`TASK_ID = TG-024`; `RISK_CLASS = STANDARD`; `Primary Ownership = LANE-C`; `CONTRACT_BASE_SHA = 611acf21240d36fc933b843022a26530f5a97526` (актуальный `origin/main` при authoring). Contract branch: `codex/tg-024-contract`. Candidate TG-021 implementation: `55131985aa9ef791d33fffb7aa53b4820c6503a9`; authoring разрешён, implementation блокирован до `TG021_FINAL_READY=YES`. Будущую implementation base назначает Integration Agent отдельно.

## 2. Goal

Описать проверяемый UX подрядчика от актуального отправленного Assignment до рабочего Result: ограниченный контекст до принятия, действия только текущего исполнителя, понятный submit и безопасное обновление после изменения Case. Один Case и его итерации сохраняют продуктовую семантику при доработке.

## 3. Canonical sources

Приоритет по `AGENTS.md`: `docs/01_PRODUCT_FREEZE.md` §§6–9; `docs/02_PRODUCT_SPEC.md` §§2.4, 9, 11, 13, 16, 22 и AC-012/013, AC-021–024, AC-032–036, AC-063/067/069/071–073; `docs/03_ARCHITECTURE.md` §11.4; `docs/05_INTERFACE_CONTRACTS.md` §§4–9, 14–16 (включая 15A), 23, 29–30; `tasks/TASK_GRAPH.md` (TG-024), `tasks/TASK_TEMPLATE.md`, `tasks/TG-021_TASK_CONTRACT.md`. Потреблять утверждённые typed contracts и server-filtered read seam TG-021 без изменения их semantics.

## 4. Dependencies / unlocks

`Depends On = TG-021`; `Unlocks = TG-028, TG-029`; `Parallel With = TG-013, TG-018, TG-023`. TG-013/TG-018 не являются скрытыми direct dependencies; конкретный demo actor A/B определяется сервером. Implementation ждать `TG021_FINAL_READY=YES`.

## 5. Allowed write scope

Сейчас только `tasks/TG-024_TASK_CONTRACT.md`. Для последующей implementation: `apps/web/src/features/contractor/**`, включая собственные fixtures/tests и feature contribution для композиции TG-029. Shared router, Case read layer, contracts и manifests остаются у их владельцев.

## 6. Forbidden scope

На этой стадии не писать код, не canonicalize, не проводить independent review. В implementation не менять Product/Architecture/Interface semantics, TG-021 read, backend, TG-023 UK controls, центральный router или shared files. Не показывать UK completion controls, причины отказов других подрядчиков, административные события УК и произвольную запрещённую историю Case; не загружать полный Case с последующим CSS hiding. Не выводить права из роли/состояния на клиенте и не превращать upload в завершение.

## 7. Required behavior / invariants

- **Selected only:** подрядчик не получает Case в списке/карточке и не видит действий до отдельной отправки Assignment. **Pending/sent:** только server-filtered контекст §2.4 (Case ID, адрес/помещение, категория, описание, исходные вложения, требование к результату и необходимая релевантная история/коммуникация) и `AcceptAssignment` / `RejectAssignment`; отказ требует непустую причину. Только exact current pending `assignment_id`; прежнее назначение не переиспользуется даже после нового назначения той же организации.
- **Accepted current executor:** после успешного принятия и authoritative refetch доступны только server-provided `allowed_actions`: рабочие комментарии в `EXECUTION`/`REWORK`, разрешённые материалы и `SubmitResult`. Общая лента остаётся единственным каналом рабочих комментариев; pending/old contractor не пишет и не отправляет результат. Текущий исполнитель видит актуальную итерацию и рабочее замечание при доработке только в пределах серверной проекции.
- **Rework:** при N→N+1 с тем же текущим исполнителем принятый Assignment сохраняет силу, `REWORK` сразу даёт повторную работу и новый Result без второго accept; прежний Result не затирается. При A→B после нового выбора/вступившего в силу переназначения A теряет дальнейший LIVE UI/access при refetch; B на стадии выбора не видит Case, после отдельной отправки получает pending контекст и становится current executor лишь после своего accept. Итерация остаётся N+1 во всех шагах смены подрядчика.
- **Result:** UI объясняет обязательный непустой текст и `result_requirement_snapshot = NONE | PHOTO | FILE`; PHOTO/FILE требуют подходящий материал. Upload привязан к exact current assignment и iteration, не меняет состояние и сам по себе не сообщает о выполнении. Submit передаёт exact `assignment_id`, `iteration_id` и выбранные `material_attachment_ids`; показывает pending/success/validation/server error. Только подтверждённый submit переводит в `AWAITING_RESULT_CHECK`; он не закрывает Case и не объявляет доставку MAX состоявшейся по статусу `QUEUED`.
- **Stale и безопасность:** во время pending не допускать повторной отправки; idempotency key и canonical response используются по Interface Contract, поэтому повтор/двойной submit не создаёт второй Result. На `409` не показывать успех, обновить Case/activity/`allowed_actions`, убрать утраченную поверхность и потребовать новое явное действие; не retry и не retarget автоматически. `403`/скрывающий `404` не раскрывают чужой Case. Backend повторно проверяет доступ, target и состояние каждой команды; `allowed_actions` служит UX-сигналом, а не клиентской авторизацией.

## 8. Dependency requests

`NONE`. Использовать существующие React, TanStack Query, TG-002 wire contracts и TG-021 read seam; shared manifests/lockfile не менять.

## 9. Acceptance criteria

1. Selected-only не видит Case; pending видит ровно ограниченный контекст и accept/reject, с валидацией причины; accepted current executor получает только актуальные рабочие действия.
2. Same-contractor N+1 работает без второго accept. В A→B старый A удалён из LIVE UI после refetch, B проходит selected→pending→accepted, а номер итерации остаётся N+1.
3. Комментарии, upload и submit используют текущие server-provided capabilities и exact targets; PHOTO/FILE требование понятно, material без submit не завершает работу, Result не завершает Case.
4. Pending/success/error, double-submit и `409` наблюдаемы; после конфликта projection и действия обновлены без ложного успеха. Запрещённые данные и UK controls не отображаются.

## 10. Required tests

На будущей implementation branch: `npm run typecheck -w @max-smart-city/web`, `npm test -w @max-smart-city/web`, `npm run build -w @max-smart-city/web`, `git diff --check <implementation-base>`; все успешны. Targeted fixtures/tests: selected-only hidden; pending limited; accept; reject reason validation; current executor; comments/materials; upload+submit; duplicate submit; same-contractor N+1; A→B old/selected/pending/current с неизменной N+1; A removed on refetch; `409` refetch/no retry/no retarget; required PHOTO/FILE и upload без completion. Проверить mobile/web MAX viewport.

## 11. Git / integration handoff

Authoring: branch `codex/tg-024-contract` от указанного `CONTRACT_BASE_SHA`; self-check, commit/push только этого файла с существующей человеческой Git identity, проверить local/remote SHA и clean worktree. Передать Integration Agent SHA, результаты self-check и gate `TG021_FINAL_READY=YES` для назначения будущей implementation base. Не push `main`.

## 12. Blocker protocol

Остановить затронутую работу при `SPEC CONFLICT`, неверной базе, выходе за write scope или несовместимости утверждённых интерфейсов; передать конкретный blocker владельцу. До `TG021_FINAL_READY=YES` не начинать implementation; authoring и self-check от этого не блокируются.
