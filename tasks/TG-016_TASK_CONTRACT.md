# TG-016 — Feedback, clarification, rework и completion branches

## 1. Identity / BASE_SHA

```text
TASK_ID = TG-016
RISK_CLASS = CRITICAL
PRIMARY_OWNERSHIP = LANE-B
BASE_SHA = CONTRACT_BASE_SHA = 4b86dfa8f1535386e1d9f888eaedb1e014bd378b
CONTRACT_BRANCH = codex/tg-016-contract
UPSTREAM_TG014_CONTRACT_SHA = 362d60de13843de5e7cbfdc8bac3c12f1dcf95f7
UPSTREAM_TG015_CONTRACT_SHA = 160734b252bb945ad4a400eb5afe490ddcc29fbf
```

База — actual `origin/main` после fetch; перед authoring сверена с `git rev-parse HEAD` выбранной ветки. Сейчас **только contract authoring + self-check → один independent review**, без implementation/canonicalization `main`. Оба upstream contracts имеют `REVIEW_STATUS=PASS` по handoff; implementations TG-014/TG-015 pending. Feature SHA — источники, не доказательство их интеграции в base. Implementation TG-016 запрещена до completion **обеих** direct implementation dependencies и собственного review PASS.

## 2. Goal

Зафиксировать remaining lifecycle одного Case: формальная реакция жителя, уточнение УК и ответ, ручной факт отсутствия feedback, доработка и три основания завершения УК. Наблюдаемый результат — exact targets, одна формальная ветка на Result, сохранённая история, ровно N+1 при доработке и терминальное завершение без таймеров.

## 3. Canonical sources

Приоритет по `AGENTS.md`. Продукт: `docs/01_PRODUCT_FREEZE.md` §§6–9, 11; `docs/02_PRODUCT_SPEC.md` §§6, 9, 14–17, 22–24 (TR-008…016/020, INV-001…006/012/014…032, AC-002/004/005/014…020/025…028/063…071). Технические границы: `docs/03_ARCHITECTURE.md` §§9.4, 11–17; `docs/04_DATA_MODEL.md` §§12.4, 14–18, 20, 26, 28–32, 34–35; `docs/05_INTERFACE_CONTRACTS.md` §§4–5, 9, 17–23, 26, 29–34, 37. Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` §TG-016.

Exact upstream, прочитанные через Git без добавления чужих файлов: `tasks/TG-014_TASK_CONTRACT.md` и `tasks/TG-015_TASK_CONTRACT.md` на SHA §1; TG-011 policy contract на `fcfe5af6c980d748c0cac632db2fe1a20a03f85e`; TG-012 kernel contract на `405c932b0d9362840b3691cba1103e50ac1a19a3`. TG-002 wire schemas и TG-009 `evaluateDomain`/plans из base потребляются без дублирования. Исторические status-строки документов не отменяют текущий handoff/gates.

## 4. Dependencies / unlocks

```text
Depends On = TG-014, TG-015
Unlocks = TG-017, TG-026
Parallel With = NONE
TASK_GRAPH_DIVERGENCE = NONE
```

TG-011/TG-012/TG-009 — reuse через upstream chain, без новых direct graph edges. Authoring разрешён при pending implementations; implementation gate остаётся закрытым.

## 5. Allowed write scope

Сейчас **только** `tasks/TG-016_TASK_CONTRACT.md`. Будущий command slice — `apps/api/src/modules/cases/commands/feedback-resolution/**` и принадлежащие ему targeted tests. TG-015 владеет **единственным** общим AddComment handler/attachment service; TG-016 создаёт clarification target и проверяет совместимость reply context, не создаёт второй endpoint/handler. TG-011 — policy, TG-012 — kernel, TG-009 — state machine, TG-014 — select/send, TG-017 — read projections. Shared repository/routes/wiring или targeted изменения TG-015 согласуются по конкретному файлу и владельцу через Integration Agent перед implementation; текущий whitelist не расширяется.

## 6. Forbidden scope

Не менять `main`, canonical docs/graph/upstream contracts, код, manifests/lockfile или review artifacts на authoring stage. Не вводить timer/auto-close, девятое state, новый Case при rework, reopen, Resident/Contractor completion, второй acceptance того же current executor, второй increment при REWORK A→B, private Resident↔Contractor chat, generic state/feedback CRUD, generic event fallback. Не дублировать TG-009 state machine, TG-011 authorization, TG-012 concurrency/idempotency или TG-015 AddComment; `expected_revision` не correctness gate. Outbox delivery/MAX network, UI и полные read/activity/allowed_actions projections — вне slice.

## 7. Required behavior / invariants

**Общая boundary.** Все mutations, включая reply через TG-015, используют TG-012: обязательный `Idempotency-Key`, `APP_USER` effective principal, canonical fingerprint (для multipart включая bytes), reservation → Case row lock → current TG-011 authority/tenant/resource/run visibility → terminal guard → exact targets/currentness → state/business validation → atomic facts/projection/`updated_at` → prescribed events → post-command revision → stored canonical success → commit. `evaluateDomain` получает locked current snapshot и server-derived inputs; планы применяются без локальной машины переходов. Domain error categories переводятся в command-specific HTTP/codes Interface §§4/29/31, не generic fallback. Success `200` по Interface §32 с `command_id/case_id/state/revision/created/event_ids`; RecordNoFeedback возвращает exact `no_feedback_event_id` по §19A. Ошибка откатывает все facts/events/projection/revision/reservation.

**Authorization.** Resident — только own Case с active premises access и permitted exact target. `UK_EMPLOYEE` — own organization + active house scope; `UK_ADMIN` — own organization по TG-011 policy. Contractor не имеет formal feedback, request-clarification, record-no-feedback, rework decision или completion authority. Session/UI/client IDs не заменяют current policy. Hidden tenant/Case/run/target получает `404` до раскрывающих terminal/stale/basis errors; forbidden action на видимом ресурсе — `403`. Current security gate применяется и к protected replay.

| Command / TR | Exact target, state, input | Atomic facts / state / prescribed events |
|---|---|---|
| ResidentConfirmation / TR-008 | Resident; `result_id + iteration_id`, exact current Result/current iteration; feedback отсутствует; `AWAITING_RESULT_CHECK` | Immutable `ResidentFeedback(CONFIRMATION)`; **state остаётся awaiting**, Case не закрывается; только EVT-010 |
| ResidentRemark / TR-009 | Тот же current target/Resident/state, feedback отсутствует; непустой `remark_text`, optional validated same-Case attachments | `ResidentFeedback(REMARK)` + typed attachment links; `REMARKS_REVIEW`; только EVT-011 |
| RequestClarification / TR-013 | UK; exact `result_id + feedback_id`, current REMARK того же Case; `REMARKS_REVIEW`; непустой message | `Comment(CLARIFICATION_REQUEST)` с exact Result/Feedback/iteration context, optional links; state unchanged; **EVT-012 only**, без EVT-007 |
| Resident clarification reply / TR-014 | Own Resident; TG-015 AddComment с `clarification_request_id`; `REMARKS_REVIEW`; visible request того же Case/current Result/current REMARK/current iteration | `CLARIFICATION_REPLY`, direct `in_reply_to_comment_id`, inherited Result/Feedback/iteration context; body либо permitted attachment непусты; state unchanged; **EVT-007 only** |
| RecordNoFeedback / TR-010 | UK; `result_id + iteration_id`, current Result, `AWAITING_RESULT_CHECK`; feedback и EVT-015 отсутствуют; explicit `basis_confirmed=true` и непустой `basis_note` процесса УК | Один manual EVT-015, non-null exact current `result_id`; state/current Result unchanged; не создаёт confirmation/closure |
| ReturnToRework / TR-015 | UK; exact `result_id + feedback_id`, current REMARK; `REMARKS_REVIEW`; current accepted Assignment/executor существуют | Same Case, decision по N + ровно одна CaseIteration N+1; current iteration=N+1, current Result=NULL, `REWORK`; accepted current Assignment/executor сохранены; **EVT-013 + derived EVT-014 only** |
| CompleteCase normal / TR-011 | UK; `AWAITING_RESULT_CHECK`; current `result_id`, `basis.type=RESIDENT_CONFIRMATION` + exact `feedback_id` типа CONFIRMATION того же Result/iteration | Closure `RESIDENT_CONFIRMATION`, `COMPLETED`; **EVT-016 only** |
| CompleteCase no-feedback / TR-012 | UK; тот же state/current Result; `basis.type=NO_RESIDENT_FEEDBACK`, exact EVT-015 `event_id` этого Result; feedback отсутствует на commit; отдельный `completion_basis.confirmed=true` и непустой `process_reference` | Closure `NO_RESIDENT_FEEDBACK`, `COMPLETED`; **EVT-016 only** с audit/presentation completion basis, отличным от recording basis EVT-015 |
| CompleteWithExplanation / TR-016 | UK; `REMARKS_REVIEW`; exact `result_id + feedback_id`, current REMARK; непустое валидное `explanation` | Closure `DISPUTED_WITH_EXPLANATION` + explanation, `COMPLETED`; **EVT-017 only**, без EVT-016 |

**Formal feedback / late feedback.** `UNIQUE(result_id)` допускает максимум одну mutually exclusive formal branch, confirmation либо remark; комментарий/уточнение не второе formal feedback. Old Result/iteration не retarget'ятся в current. EVT-015 **не блокирует** первую валидную confirmation/remark до completion: такой feedback принимается по Interface §§17–18, EVT-015 остаётся immutable историческим фактом, no-feedback completion становится неприменимой. Confirmation позволяет последующее **явное normal completion**; remark требует UK clarification/rework/disputed branch. RecordNoFeedback не закрывает Case; один EVT-015 на Result закреплён existing non-null CHECK/partial uniqueness Data Model §17.6. Duplicate same key — protected stored replay, другой key — `409 NO_FEEDBACK_ALREADY_RECORDED`; feedback уже существует — `409 FEEDBACK_ALREADY_SUBMITTED`. Никакой elapsed-time inference или автоматического действия; EVT-015 alone недостаточен для completion.

**Clarification context / observable history.** Для request/rework/disputed completion iteration не client-selected: выводится из immutable Result/Feedback и под lock должна быть current; target Feedback — REMARK того же Result/Case/iteration. Reply требует существующего visible `CLARIFICATION_REQUEST`, совпадения всех context IDs и прямой ссылки; missing/wrong-kind/stale target — `409 CLARIFICATION_CONTEXT_REQUIRED`, hidden foreign target — `404`. Arbitrary Resident comment в `REMARKS_REVIEW` запрещён. Request/reply сохраняются в одной истории/feed, наблюдаемой УК; обязательная коммуникация не private chat. TG-017 отображает один item на `CaseEvent.event_id`, enriched Comment/Feedback, без дублирования business fact; explanation и исходное замечание остаются доступны Resident по permitted projection.

**Rework / history.** EVT-013 фиксирует decision по N с exact old Result/Feedback; EVT-014 — новую N+1, `derived=true`, `caused_by_event_id=EVT-013`, тот же initiating UK actor/`command_id`, последовательный `event_seq`. Это один atomic effect set, не отменяющий physical write order Interface §33. Old Result/Feedback/EVT-015/comments/links/iterations не редактируются и не удаляются; old selection больше не current по TG-009 plan, current feedback/no-feedback context очищается вместе с Result. Existing accepted Assignment N остаётся основанием same-contractor authority в N+1: `Assignment.created_iteration_id` не требует equality с новой iteration; work/comment/material/new Result проходят через TG-015 **без второго accept**. Если затем UK выбирает B, reuse TG-014 Select/Send/Accept в уже созданной N+1: current Assignment/executor A очищаются, A теряет LIVE/replay access сразу, B selected ещё без доступа; новое acceptance требуется B. Case и N+1 ID/no не меняются, EVT-013/014 не повторяются. Допустим повторный цикл только после **нового** Result N+1 и нового REMARK; лимит циклов не вводится.

**Concurrency: first valid wins через TG-012.** Different-key команды сериализуются единственным Case lock, reread current facts; loser не оставляет effects. Exact target/state conflicts после security/terminal ordering получают canonical `409`; не исправлять target автоматически. Same principal/key/fingerprint ждёт owner и replay'ит stored status/body без новых events/revision и без повторной business-transition validation; current authority всё равно обязательна, changed payload/file bytes — `IDEMPOTENCY_KEY_REUSE` после gates.

| Race (оба lock orders) | Обязательный исход |
|---|---|
| confirmation vs remark | Одна Feedback/один EVT-010 **или** EVT-011; loser semantic `409 FEEDBACK_ALREADY_SUBMITTED`/`INVALID_STATE` по текущему context, без второй ветки |
| feedback vs RecordNoFeedback / late feedback after EVT-015 | Feedback-first запрещает EVT-015; EVT-015-first допускает valid late feedback, сохраняет EVT-015 и исключает no-feedback completion |
| late feedback vs no-feedback completion | Feedback-first делает прежний basis invalid (`COMPLETION_BASIS_INVALID` либо current state conflict); допустимое completion-first отклоняет feedback через `TERMINAL_CASE`; confirmation требует fresh normal basis, remark — disputed/rework route |
| ReturnToRework vs disputed completion | Rework-first даёт только N+1 + EVT-013/014, disputed loser stale/current-context `409`; completion-first даёт EVT-017, rework loser `409 TERMINAL_CASE` по общему terminal guard |
| repeated ReturnToRework | Same-key replay сохраняет N+1; другой key по прежним Result/Feedback — stale/current-context `409`, без N+2; только новый цикл допускает очередной increment |
| late remark vs completion | Проверять fixture **без feedback с EVT-015 и отдельным valid manual completion basis**; remark-first исключает ordinary completion, completion-first — `TERMINAL_CASE`. Fixture с уже CONFIRMATION не допускает remark независимо от очередности |
| completion/rework vs clarification request/reply | Valid clarification-first сохраняет Comment/его prescribed event, последующее решение UK допустимо: clarification не блокирует completion/rework. Terminal-first отвергает request/reply; rework-first делает exact old clarification context stale, reply не превращается в рабочий comment N+1. Если reply пришёл до persisted target request, context-required conflict; request-first делает exact target доступным |

**Terminal.** Only UK completes; `COMPLETED` запрещает все новые process mutations, включая feedback/request/reply/rework/comment/result/assignment, и не имеет reopen. Legitimate authorized same-key replay — выдача уже committed эффекта, не новое mutation. Stored history остаётся read-only и role-filtered.

## 8. Dependency requests

`DEPENDENCY_REQUESTS = NONE`. Reuse existing TG-002 schemas, TG-007 persistence/constraints, TG-009 plans, TG-011 policy, TG-012 runner и TG-014/TG-015 services. Несовместимость фактического upstream surface/shared wiring направить точному владельцу через Integration Agent до затронутой implementation; новых package/manifest изменений не требуется.

## 9. Acceptance criteria

Все строки §7 сохраняют exact canonical targets/state/facts/event sets. Одна Feedback на Result, confirmation не completion, old Result не получает current feedback. EVT-015 unique/manual и не запрещает late feedback; no-feedback closure требует отдельного explicit basis и отсутствия Feedback на commit. ReturnToRework сохраняет Case/history/current accepted executor и создаёт ровно N+1; TG-014 reassignment не increment'ит повторно. Три closure branches UK различимы, disputed explanation обязательна и EVT-017 не дублируется EVT-016. Request/reply exact context и одна наблюдаемая история совместимы с общим TG-015 handler. TG-011 isolation/replay gate, TG-012 serialization/rollback и terminal guard соблюдены; TG-017 получает command capability descriptors для собственной projection без дублирования policy/state rules.

## 10. Required tests

На **будущей implementation stage** — targeted handler/API suites и controlled **real PostgreSQL** concurrency/atomicity tests; mock/SQLite не заменяют evidence:

1. Confirmation happy path: exact current Result/iteration, одна Feedback/EVT-010, awaiting unchanged; assertion confirmation **!= completion**. Remark: nonempty text/optional same-Case files, REMARK/EVT-011, `REMARKS_REVIEW`; empty remark/invalid attachment reject без effects.
2. Sequential и concurrent confirmation||remark в обоих порядках: ровно одна branch/event; same-key canonical replay; changed payload/file bytes key-reuse. Old Result, wrong/old iteration, cross-Case target, неверный Feedback type/Result/iteration для UK decisions — rejected, no silent retarget.
3. Request/reply happy path через **общий TG-015 AddComment**: exact inherited context/direct link, unchanged state, request только EVT-012, reply только EVT-007, одна feed запись на event, observable UK. Missing/nonexistent/wrong-kind/foreign/invisible/old Result/old Feedback/old iteration clarification target rejected; произвольный Resident comment в remarks review denied.
4. RecordNoFeedback: manual basis, один exact-result EVT-015/non-null link, unchanged awaiting/current Result, без confirmation/closure. False/missing assertion/empty basis reject; duplicate same key replay, different key `NO_FEEDBACK_ALREADY_RECORDED`; concurrent different keys дают один EVT-015. Feedback-first запрещает recording.
5. Late confirmation **и** late remark после EVT-015 accepted до completion; старое EVT-015 сохранено, no-feedback branch invalid. Для confirmation — fresh explicit normal completion, для remark — remarks decision. Проверить feedback||recording и feedback||no-feedback completion в обоих controlled lock orders.
6. Normal completion требует current CONFIRMATION; no-feedback completion — exact current EVT-015 + отдельный confirmed/nonempty completion basis и no Feedback на commit. EVT-015 alone, wrong event/result, stale/changed basis rejected; EVT-016 хранит completion basis, не ложное Resident confirmation.
7. Disputed completion: current REMARK, непустое explanation, closure `DISPUTED_WITH_EXPLANATION`, `COMPLETED`, **EVT-017 only**. Empty/whitespace explanation reject; исходное замечание/объяснение сохранены и permitted Resident projection их показывает.
8. ReturnToRework: same Case, exact N+1, current Result=NULL, old Result/Feedback/comments/attachments/events intact; EVT-013 по N, derived EVT-014 по N+1 с exact cause/actor/command. Same accepted Assignment N/current executor survives; TG-015 comment/material/Result N+1 работают без reaccept. Повтор прежней rework-команды sequential/concurrent/same-key не создаёт N+2; новый Result+remark допускает следующий цикл.
9. Отдельный REWORK A→B through TG-014 select/send/accept: та же N+1, без новых EVT-013/014, immediate A access/replay revocation, B selected/pending не executor, только B accept даёт executor; rejection B тоже не increment'ит.
10. Rework||disputed completion и late remark||completion с valid no-feedback fixture — оба lock orders, только compatible winner effects. Completion/rework||clarification request/reply — оба порядка, clarification-first может сохраниться до UK decision, terminal/stale-context-first не создаёт новый Comment и не retarget'ит reply N→N+1.
11. Role/tenant/house/premises/run/current access matrix: own Resident/permitted UK only; Resident/Contractor не complete, Contractor не formal feedback/UK decision. Revoked binding и hidden foreign target/run/replay не раскрывают protected success/stale/terminal. COMPLETED rejects **все** новые lifecycle mutations; read-only history и authorized stored replay сохраняются.
12. Fault injection на facts/links/iteration/events/finalize: полный rollback, ноль orphan success/partial events/revision; retry после rollback валиден. Каждый success имеет correct actor/targets/sequence/command correlation/post-command revision/canonical response, retry не дублирует effect set.

После implementation: targeted suites, explicit real-PostgreSQL suite command/result, `npm run typecheck`, `npm run build`, `npm test`, `git diff --check` — PASS. Root `npm run test:integration` в authoring base — `NO_SUITE_YET`: exit 0 placeholder не evidence. Сейчас только self-check документа: ровно 12 Lean sections, canonical graph/SHA/sources/semantics, diff/whitespace и единственный changed file; runtime tests не запускались и их PASS не заявляется.

## 11. Git / integration handoff

Authoring от exact §1 base: commit/push **только `codex/tg-016-contract`** с существующей human identity; вернуть full contract SHA, remote SHA match, clean worktree и self-check. Не push/canonicalize `main`. После authoring — **one independent CRITICAL review**, без committed review artifacts. При FIX_REQUIRED — один полный batch findings → один batch fix → targeted closure only. После PASS review и completion TG-014 **и** TG-015 Integration Agent назначает implementation base/branch, сверяет actual upstream implementation SHA и shared seams. Material upstream changes требуют targeted synchronization перед coding. Implementation и wave integration — отдельные этапы; этот контракт не снимает gate.

## 12. Blocker protocol

Неверная база/upstream SHA, конфликт canonical semantics, несовместимость TG-009/011/012/014/015 interfaces, отсутствие exact clarification/replay/persistence boundary или выход за write scope: остановить затронутую работу и сообщить точный source/расхождение/владельца Integration Agent. При `SPEC CONFLICT` не менять product и не писать обход; решение команды фиксируется по `AGENTS.md`. Pending TG-014/TG-015 implementation — gate, не blocker текущего authoring/review. Review findings не превращать в новые процессные артефакты или многоступенчатый review chain.
