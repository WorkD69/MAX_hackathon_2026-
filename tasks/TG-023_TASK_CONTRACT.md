# TG-023 — UK operational workflow UX

## 1. Identity / BASE_SHA

`TASK_ID = TG-023`; `RISK_CLASS = STANDARD`; `Primary Ownership = LANE-D`; `CONTRACT_BASE_SHA = 611acf21240d36fc933b843022a26530f5a97526` (`origin/main` при authoring). Contract branch: `codex/tg-023-contract`. TG-021 candidate: `55131985aa9ef791d33fffb7aa53b4820c6503a9`; это не final implementation base.

## 2. Goal

Дать сотруднику и администратору УК проверяемые рабочие действия в одной карточке Case: принять, выбрать и передать подрядчику, общаться в единой ленте, обработать замечание, доработку и три основания завершения. UI показывает только серверную ролевую проекцию и исполняет только явно доступные `allowed_actions`.

## 3. Canonical sources

Приоритет — `AGENTS.md`. Продукт: `docs/01_PRODUCT_FREEZE.md` §§6–9, 17; `docs/02_PRODUCT_SPEC.md` §§2.2, 3.9, 6–8, 11, 15–17, TR-018/019/021, INV-027, AC-005/040. Техника: `docs/03_ARCHITECTURE.md` §§8.2–8.4, 11.3–11.4; `docs/05_INTERFACE_CONTRACTS.md` §§6–9, 11–13, 19–23, 26, 29–30; `packages/contracts/src/{reads,commands,attachments}.ts` (TG-002). Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` (TG-023), `tasks/TG-021_TASK_CONTRACT.md`. TG-021 read/action slots сверены по указанному candidate SHA; до implementation сверить с финальным TG-021.

## 4. Dependencies / unlocks

`Depends On = TG-021`; `Unlocks = TG-028, TG-029`; `Parallel With = TG-013, TG-018, TG-024`. Authoring разрешён; `TG-023 implementation = BLOCKED` до `TG021_FINAL_READY=YES`. TG-029 владеет центральной композицией маршрутов.

## 5. Allowed write scope

Сейчас — только `tasks/TG-023_TASK_CONTRACT.md`. Будущая implementation — только `apps/web/src/features/uk-workflow/**` с feature-owned компонентами, transport, fixtures и тестами. Использовать публичные TG-002 contracts и финальные TG-021 read/action slots; shared files остаются у их владельцев.

## 6. Forbidden scope

Не менять Product/Architecture/Interface semantics, backend, `packages/contracts/**`, TG-021 read implementation, session/router, root manifests или файлы параллельных задач. Нет reopen, withdraw, generic state editor, timer/auto completion, private Resident↔Contractor channel, client-side workflow authority или optimistic workflow mutation.

## 7. Required behavior / invariants

- `AcceptCase`, `SelectContractor` и `SendAssignment` — отдельные явные шаги: **selected ≠ sent ≠ accepted**. Выбор виден УК, но не открывает подрядчику Case; отправка создаёт pending Assignment; только явное принятие даёт исполнителя. Показывать УК причину отклонённого назначения; Resident получает только безопасную проекцию без exact reject reason.
- Обычный UK `AddComment` доступен только при серверном `ADD_COMMENT` и в canonical permitted non-terminal context; optional permitted comment attachment идёт по §§23/26. Рабочий комментарий и отдельный `RequestClarification` по exact current Result+Remark попадают в **одну** observable activity feed после refetch; clarification не подменяется обычным комментарием. В terminal/forbidden context формы и отправки нет.
- В `REMARKS_REVIEW` УК выбирает `RequestClarification`, `ReturnToRework` или disputed `CompleteWithExplanation`; последнее требует непустое объяснение. Resident confirmation оставляет Case в ожидании решения УК и не завершает его автоматически.
- `ReturnToRework` сохраняет Case ID и уже создаёт `N+1`. При смене A→B УК отдельно выбирает и отправляет B по exact текущей итерации без нового инкремента. После authoritative refetch A не имеет LIVE actions; B до send не имеет доступа, после send имеет только pending actions, после accept — appropriate current-executor actions.
- Завершение имеет три разные ветки: current Resident confirmation + explicit UK `CompleteCase`; вручную записанный EVT-015 и затем **отдельное** explicit UK подтверждение основания `NO_RESIDENT_FEEDBACK` для `CompleteCase`; current Remark + UK `CompleteWithExplanation`. Ни EVT-015, ни Resident confirmation сами не закрывают Case; формальный feedback, пришедший до no-feedback completion, инвалидирует эту ветку. Таймера нет.
- Каждый command показывает pending, success и semantic error. После success — authoritative refetch snapshot/activity/`allowed_actions`; после `409` — stale сообщение, refetch и новое явное действие. Формы держат exact IDs (`selection_id`, `assignment_id`, `iteration_id`, `result_id`, `feedback_id`, EVT-015 `event_id` по контракту); устаревший target не меняется автоматически на новый.

## 8. Dependency requests

К владельцу TG-021 при canonical reconciliation: финальный read/action slot должен позволять feature-owned форме передать typed command payload с exact target через авторизованный transport и вызвать общий success/409 refetch, без правки центрального router задачей TG-023. Candidate SHA даёт `ActionRenderers(action, submit)` и `executeAction(action)` без payload; этого недостаточно для select/send, comment, clarification и completion forms. Сверить или закрыть seam до `TG021_FINAL_READY=YES`. Пакеты и shared manifests: `NONE`.

## 9. Acceptance criteria

1. UK управляет accept/select/send/reject-reason, а подписи и права различают selected, sent, accepted; Resident не получает exact reject reason.
2. UK comment с optional разрешённым вложением и clarification отображаются в единой ленте после refetch; terminal/forbidden comment недоступен.
3. Rework A→B сохраняет Case ID и ровно N+1, убирает LIVE actions A и даёт B только соответствующие pending/current actions.
4. Три completion branches имеют правильные exact targets; no-feedback состоит из двух manual steps, disputed требует explanation; Resident confirmation не закрывает Case.
5. Pending/success/semantic-error/409 понятны, после success/409 читается authoritative snapshot; stale selection/result не retarget'ится и не retry'ится автоматически.

## 10. Required tests

На будущей implementation branch: web typecheck, test, build и `git diff --check` должны пройти. Component/transport fixtures: accept/select/send; rejected reason и Resident privacy; UK AddComment success, forbidden/terminal, optional attachment и activity после refetch; server `allowed_actions` и exact targets; rework A→B, A loses actions, B pending/current, stable N+1; clarification; normal/no-feedback/disputed completion, два manual no-feedback шага и required explanation; pending/success/semantic-error/409, stale selection/result без auto-retarget. Проверять ролевые payload, не имитировать backend authorization во frontend.

## 11. Git / integration handoff

Contract: self-check, `git diff --check`, commit/push только `codex/tg-023-contract` с существующей human Git identity; передать полный contract SHA, base SHA, remote match и clean worktree. Не canonicalize `main`. Implementation начинать отдельной задачей только после `TG021_FINAL_READY=YES` и сверки финальных slots; передать Integration Agent результаты gates и write-scope diff.

## 12. Blocker protocol

При `SPEC CONFLICT`, неверной базе, несовместимости финальных TG-021 slots/TG-002 interfaces или необходимости чужого write scope остановить затронутую implementation и передать точный blocker владельцу. До `TG021_FINAL_READY=YES` не выполнять implementation TG-023; authoring/self-check этого контракта не блокируются.
