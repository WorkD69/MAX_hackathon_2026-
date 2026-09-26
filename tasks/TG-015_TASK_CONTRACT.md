# TG-015 — Execution, comments, attachments, Result и outbox intent

## 1. Identity / BASE_SHA

```text
TASK_ID = TG-015
RISK_CLASS = CRITICAL
PRIMARY_OWNERSHIP = LANE-B
BASE_SHA = CONTRACT_BASE_SHA = 4b86dfa8f1535386e1d9f888eaedb1e014bd378b
CONTRACT_BRANCH = codex/tg-015-contract
UPSTREAM_TG007_IMPLEMENTATION_SHA = 3fb3bb1d110cb84e546916f7d0ede03c0d646d39
UPSTREAM_TG014_CONTRACT_SHA = 362d60de13843de5e7cbfdc8bac3c12f1dcf95f7
```

База — actual `origin/main` после fetch, сверена с `git rev-parse HEAD` выбранной ветки. Сейчас **только contract authoring → one independent review**, без implementation и canonicalization `main`. TG-007 implementation COMPLETE по handoff; TG-014 contract REVIEW_STATUS=PASS, FINDINGS=0, implementation **не завершена**. Feature SHA не означают интеграцию в base. Будущая implementation требует отдельно назначенной актуальной базы после завершения обеих direct implementation dependencies и review PASS этого контракта.

## 2. Goal

Зафиксировать рабочий backend slice до валидного сообщения current accepted executor о выполнении: общие комментарии, защищённые attachments/materials и атомарный `SubmitResult`. Успех сохраняет immutable Result текущей iteration, переводит тот же Case в `AWAITING_RESULT_CHECK`, создаёт EVT-008 и один durable notification intent. Проверка результата, feedback, rework transition и completion принадлежат TG-016.

## 3. Canonical sources

Приоритет по `AGENTS.md`; продукт нормативен: `docs/01_PRODUCT_FREEZE.md` §§6.4, 8–12; `docs/02_PRODUCT_SPEC.md` §§2.4, 9.4–9.6, 11, 13, 16, 22–24 (AC-006/021–024/028/032–043/063/069/071–073). Технические границы: `docs/03_ARCHITECTURE.md` §§9.4, 11–19, 25–26, 31.2; `docs/04_DATA_MODEL.md` §§12.4, 13, 15–20, 24–32, 34–35; `docs/05_INTERFACE_CONTRACTS.md` §§4–5, 15A, 16, 23, 26, 28.1–28.3/28.6, 29–33; `docs/07_DECISIONS.md` ADR-010…015/017…020/026/027. Governance: `docs/08_PROJECT_STATE.md`, `docs/ORCHESTRATOR_HANDOFF.md`, `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` §TG-015.

Exact upstream sources, прочитанные через Git без добавления чужих файлов в эту ветку:

- Reviewed persistence contract `tasks/TG-007_TASK_CONTRACT.md` на `f760ed6703a1458dd1f01ef821b50afdd350e79e`; TG-007 Attachment/link/intent persistence на implementation SHA §1.
- Authorization `tasks/TG-011_TASK_CONTRACT.md` на `fcfe5af6c980d748c0cac632db2fe1a20a03f85e`.
- Reviewed kernel `tasks/TG-012_TASK_CONTRACT.md` на `405c932b0d9362840b3691cba1103e50ac1a19a3`.
- Final reviewed `tasks/TG-014_TASK_CONTRACT.md` на SHA §1: current accepted authority, immediate revocation при REWORK A→B.
- TG-002 wire schemas и TG-009 `evaluateDomain`/plans из base: их semantics потребляются, не дублируются. Устаревшие operational status-строки документов/upstream contracts не отменяют текущий handoff или implementation gates.

## 4. Dependencies / unlocks

```text
Depends On: TG-007, TG-014
Unlocks: TG-016
Parallel With: NONE на sequential Product E2E path
GRAPH_DIVERGENCE = NONE
IMPLEMENTATION_BLOCKED_UNTIL_DEPENDENCIES = YES
```

Это exact canonical graph; TG-011/TG-012/TG-009 и demo context — upstream consumers через dependency chain, без новых direct edges. Contract authoring разрешён сейчас; implementation запрещена до completion **обеих** TG-007/TG-014 implementations, сверки их final SHA/interfaces и integration-ready базы. TG-019 не является dependency создания intent; он позже доставляет уже committed intent.

## 5. Allowed write scope

**Сейчас только `tasks/TG-015_TASK_CONTRACT.md`.** После review PASS и §4 будущий scope: `apps/api/src/modules/cases/commands/execution/**`, `apps/api/src/modules/attachments/**`, соответствующие attachment/Result/Comment repositories/routes и slice-owned targeted tests. Reuse TG-007 transaction-bound repositories; TG-015 создаёт intent через их существующий surface, не владеет worker. Перед изменением shared repository/file конкретный owner и последовательность согласует Integration Agent. TG-011 policy, TG-012 kernel, TG-009 engine, TG-002 wire schemas и TG-016 resolution handlers остаются их владельцам; центральные app/route registries интегрирует TG-029.

## 6. Forbidden scope

Не менять canonical docs/Task Graph/upstream contracts, applied migrations, manifests/lockfile, чужие файлы; не создавать review artifacts. Сейчас нет production code. Будущий slice не реализует UK result verification, Resident formal feedback, `ReturnToRework`, новую iteration, completion/auto-close, reassignment, calendar/private chat, frontend или MAX network send/retry/redrive. Запрещены дублирование state machine, второй idempotency framework, client authority, `revision` как CAS gate, generic state PATCH, retarget stale command, изменение/удаление Result/history и raw storage URLs. Historical Assignment не создаёт кабинет старого подрядчика.

## 7. Required behavior / invariants

**Общая authority / transaction boundary.** Case mutations используют TG-012 kernel: обязательный `Idempotency-Key`, effective `APP_USER`, fingerprint (для multipart — SHA-256 фактических bytes), reservation/replay/rollback, Case `FOR UPDATE`. После lock TG-011 заново проверяет active principal/binding/access, organization/contractor, tenant/Case/resource и current ACTIVE owned DemoRun/actor, если demo. Client role/contractor/tenant IDs и `allowed_actions` не дают authority. Visibility/security gate предшествует terminal/stale/state detail и protected replay. Hidden/foreign resource — `404`, visible forbidden action — `403`; только после этого видимые stale targets получают canonical `409`. Domain decisions/plans берутся из TG-009 на authoritative locked snapshot, без второй машины переходов.

Executor authority существует **только** при exact `Case.current_assignment_id`, decision `ACCEPTED`, совпадении Assignment contractor с `Case.current_executor_contractor_id` и contractor server-bound actor. Selected-only не имеет LIVE read/act/download; sent/pending имеет только TG-014 acceptance context и не может comment/add material/submit. После reassignment старый contractor немедленно теряет LIVE list/snapshot/activity/attachment/download/actions и protected replay, несмотря на historical accepted row или valid session.

| Surface | Exact context / state | Atomic effect / canonical response |
|---|---|---|
| `POST /cases/{caseId}/comments` / AddComment | Interface §23 role/state policy; contractor — current accepted executor в `EXECUTION|REWORK`; iteration выводится из locked Case, без выдуманного wire target | Comment + optional Attachment/CommentAttachment + EVT-007; state unchanged; standard `200`, `created.comment_id` |
| `POST /cases/{caseId}/result-materials` / AddResultMaterial | Multipart payload `assignment_id + iteration_id`, ровно один valid file; current accepted executor, `EXECUTION|REWORK` | Attachment + WorkMaterialAttachment + EVT-009; state unchanged; standard `200`, `created.attachment_id`; нет Result/intent |
| `POST /cases/{caseId}/commands/submit-result` / SubmitResult | Exact current accepted `assignment_id`, current `iteration_id`, конкретные `material_attachment_ids`, непустой `description`; `EXECUTION|REWORK` | Immutable Result + ResultAttachment; current Result/state; EVT-008; один intent; `200`, created Result/intent IDs, `notification.status=QUEUED` |
| Attachment metadata/stream, capability mint/consume | Interface §26; same Case/tenant/run и TG-011 current role/contractor-context visibility | Authorized PostgreSQL bytes/metadata либо scoped HTTPS capability; нет business transition/event/Result |

Пути таблицы относительны к `/api/v1`. Все business effects, `Case.updated_at`, последовательные event IDs/`event_seq`, post-command `revision` и canonical successful `CommandExecution` response сохраняются атомарно. Ошибка до commit откатывает reservation и весь новый effect set; ранее committed work materials остаются. Events содержат initiating actor snapshots, command и relevant exact Case/iteration/Assignment/Result/Comment/Attachment links, без generic event fallback. AddComment с файлами создаёт только EVT-007, не ложный EVT-009.

**Comments ownership.** Canonical graph явно отдаёт TG-015 `AddComment`: один общий backend handler/feed по Interface §23, а не только contractor-only endpoint. Resident own Case: working comments в `EXECUTION|REWORK`; в `REMARKS_REVIEW` только reply к visible same-Case current `CLARIFICATION_REQUEST`, exact current Result/REMARK Feedback/iteration. Reply хранится как `CLARIFICATION_REPLY`, direct `in_reply_to_comment_id` и inherited context; без context — `409 CLARIFICATION_CONTEXT_REQUIRED` либо hidden `404`. UK Employee/Admin — доступный Case и permitted non-terminal working context из Product Spec/TG-009; contractor — только два рабочих state выше. Body либо permitted attachment непусты; completed Case не принимает комментарий. RequestClarification/EVT-012 и formal feedback остаются TG-016: здесь только потребление уже существующего target и AddComment/EVT-007. Общая коммуникация наблюдаема УК, без private fields/Resident↔Contractor channel. Full read projections/activity/allowed_actions — TG-017, web — TG-021…024.

**Attachment / material association.** Reuse TG-007 PostgreSQL `Attachment.content bytea`, metadata/hash и typed same-Case links. WorkMaterialAttachment фиксирует current iteration/accepted Assignment и `created_event_id`; uploader выводится из effective actor. SubmitResult принимает только уже persisted material IDs того же Case, **текущих** iteration/Assignment и этого actor; cross-Case/old-iteration/old-Assignment/чужой uploader, отсутствующие или повторные IDs не связываются с Result. Initial/comment/feedback attachment не становится work material автоматически. После business association bytes/filename/hash/meaning и Result links immutable; исправление — новый материал. Upload сам по себе не сообщает о выполнении и не создаёт EVT-008.

Required material берётся **только** из immutable `Case.result_requirement_snapshot`, установленного authoritative category/config при CreateCase: `NONE` — материал необязателен, текст всё равно обязателен; `PHOTO` — хотя бы одно validated image material; `FILE` — хотя бы одно validated file material. Изменение/deactivation live Category не переоценивает существующий snapshot. При missing required material/empty description — canonical `422` по Interface §§4/31, без Result, EVT-008, intent и state/revision change.

**Upload / download security.** MIME/size проверяются сервером, hash считается по реальным bytes; безопасные Content-Type/Length/Disposition, filename никогда не filesystem path, bytes/capability secrets не логируются. Bounded implementation parameters: максимум **10 MiB на файл**; PHOTO MIME `image/jpeg`, `image/png`; FILE MIME `application/pdf`, `text/plain`; server validation проверяет соответствие содержимого заявленному формату. Policy передаётся через typed options, без локального `process.env`/ad hoc env loader; изменение central env surface только владельцем TG-003 через интеграцию.

`GET /api/v1/attachments/{attachmentId}` применяет current TG-011 visibility до metadata/stream. `POST /api/v1/attachments/{attachmentId}/download-capability` с Idempotency-Key применяет тот же gate и TG-012 non-lifecycle reservation/replay, без изменения Case revision/history. Capability — opaque signed single-purpose HTTPS URL, bound к exact attachment и authorized principal/session/run context, TTL **120 секунд**, без raw storage locator/broad rights. Consume повторно проверяет signature/scope/expiry **и current TG-011 access bound context**, поэтому mint до reassignment не сохраняет LIVE-доступ старому contractor; foreign attachment/run и revoked context denied. Replay не продлевает expiry; новая выдача требует fresh authorization. Реальный native MAX download/client evidence принадлежит frontend/TG-033, не подменяется проверкой capability endpoint.

**SubmitResult atomic boundary.** После exact targets, state, material validation и **непосредственно до writes** defensive current readiness recheck exact recipient: normal — единственный mapped к `Case.resident_user_id` outbound-ready `MaxIdentity`; demo — explicit `DemoRun.notification_recipient_max_identity_id`, не mapping synthetic Resident. В обоих режимах `LINKED_CONFIRMED`, validated non-null `delivery_chat_id/type`; никакого first/latest/arbitrary recipient или предположения об equality MAX user IDs. Неготовность → `409 MAX_DELIVERY_TARGET_NOT_READY`, ноль нового Result/links/EVT-008/intent/successful execution, Case unchanged. Early TG-014 readiness не заменяет этот check.

Canonical physical order TG-012 / Interface §33: domain writes (Result/links) → current projection (`current_result_id`, `AWAITING_RESULT_CHECK`, `updated_at`) → EVT-008 → NotificationIntent → revision → finalize canonical response → COMMIT. Intent — ровно один `(result_id, RESULT_READY)`, unique dedupe key, exact recipient/validated chat snapshot, payload обязательного сообщения «Подрядчик сообщил о выполнении. Проверьте результат» и Case context; initial DB status `PENDING`, attempt_count=0, next_attempt_at задан, claim/delivery fields пусты по TG-007. Response `QUEUED` означает durable intent, не факт доставки. EVT-009 уже добавленных материалов не повторяется; дополнительные EVT-007/009 на SubmitResult не создаются. **MAX network вызова нет ни внутри transaction, ни в TG-015 post-commit handler**: TG-019 owns claim/send/retry/redrive. Поздняя delivery failure не откатывает Result/EVT-008 и не создаёт второй Result/intent.

**Iteration / immutable history.** Один valid Result на iteration (`UNIQUE(iteration_id)`); exact Case/current iteration/current accepted Assignment revalidated при commit. `Assignment.created_iteration_id` — время создания, не ограничение validity: нельзя требовать `Result.iteration_id == Assignment.created_iteration_id`. На canonical already-created N+1 в `REWORK` same-contractor accepted Assignment N остаётся current; add material/comment/submit проходят **без второго acceptance**, материал фиксирует N+1, новый Result не меняет Result N/links/events. TG-015 не создаёт iteration и не пишет EVT-013/014. После TG-014 выбора B старые current pointers A сняты сразу; historical accepted A не даёт действий в N+1.

**Concurrency / replay.** TG-012 reservation → Case lock → current security → exact targets/state → dependency locks/business validation → atomic effects; relevant mutable rows в canonical entity/PK order, без process mutex/CAS/retry workaround. Different keys одного Case сериализуются: first valid wins; double SubmitResult даёт один Result/EVT-008/intent, видимый loser — `409 INVALID_STATE`/canonical current-context conflict. Stale iteration/Assignment — `409 STALE_ITERATION`/`STALE_ASSIGNMENT` после visibility; old contractor — hidden `404`. Same principal/key/fingerprint ждёт owner и возвращает **stored status/body** без новых facts/events/revision после current TG-011 gate, без повторной business-transition validation; changed payload/file bytes → `409 IDEMPOTENCY_KEY_REUSE` после gates. Если доступ отозван, replay denied. SubmitResult vs reassignment проверяется на canonical **REWORK A→B**, без введения произвольной замены в EXECUTION: submit-first переводит в check и Select B больше не valid; Select B-first отзывает A, его submit/upload/comment/replay denied. Stale N request не retarget'ится в N+1; один Case lock определяет authoritative порядок.

## 8. Dependency requests

`DEPENDENCY_REQUESTS = NONE`. Использовать existing crypto/stream primitives, TG-002 schemas, TG-007 repositories, TG-011 policy, TG-012 kernel и TG-009 plans. Нужное shared wiring/config изменение или несовместимость фактического upstream surface направляется его владельцу через Integration Agent до затронутой implementation; никаких новых package/manifest edits в authoring.

## 9. Acceptance criteria

Current accepted executor выполняет AddComment/AddResultMaterial/SubmitResult только в canonical context; selected/pending/old contractor не получает рабочих прав. Upload/material не меняет state и не считается Result. Snapshot NONE/PHOTO/FILE, exact IDs/uploader и same-Case associations проверяются до Result writes. Успех даёт immutable Result, current pointer, `AWAITING_RESULT_CHECK`, один EVT-008/intent и canonical QUEUED response в одной transaction. Readiness/error/DB failure дают полный rollback; replay/races не дублируют facts. Same-contractor N+1 работает с accepted Assignment N, сохраняя old Result. Общие comments и download capabilities соблюдают current TG-011 access и не обходят отзыв authority. Нет implementation чужих slices или network send.

## 10. Required tests

На **будущей implementation stage** нужны handler/API tests и controlled **real PostgreSQL** transaction/concurrency suites; mock/SQLite не заменяют evidence:

1. Accepted executor happy path в EXECUTION: comment, valid upload/association, SubmitResult; exact target/current pointer/state, links/uploader, actor snapshots/command correlation/event sequence, post-command revision и standard responses. Upload даёт только EVT-009, comment только EVT-007, submit только EVT-008 + один intent; ранее записанный material event не дублируется.
2. Selected denied; pending denied для всех рабочих mutations, pending initial-attachment visibility только по TG-011; old contractor после rejection/reassignment denied для list/read/activity/act/metadata/stream/mint/consume и protected replay. Wrong role, foreign tenant/Case/run/attachment, revoked binding/access/contractor context: security-before-stale/terminal/key-reuse и отсутствие leaks/effects.
3. Exact Assignment target, включая old Assignment той же contractor organization; exact iteration/stale N при current N+1; terminal/invalid state; no retarget. Материал cross-Case, wrong iteration/Assignment/uploader, nonexistent/duplicate IDs и attachment другого типа association rejected без Result/links/events/intent.
4. NONE с текстом без файла; PHOTO с valid image; FILE с valid allowed file; empty text, missing required material, неверный material kind, MIME/content mismatch/size overflow reject. Boundary 10 MiB, SHA-256 реальных bytes, safe filename/headers и отсутствие bytes в logs. Live Category update/deactivation не меняет result requirement snapshot.
5. Immutable successful Result/links/Attachment/history: запрещённые UPDATE/DELETE rejected, persisted facts неизменны; новый материал не переписывает старый. Same-contractor canonical N+1 fixture с accepted Assignment N: comment/upload/submit без accept, Result N+1/WorkMaterial N+1, прежний Result N/links/events сохранены; нет новой iteration/EVT-013/014.
6. Double submit sequential и concurrent different keys same Case: один Result/EVT-008/intent, loser conflict; same-key concurrent/retry — exact stored response, один effect set, revision не растёт повторно; changed payload и multipart bytes — key-reuse. Rollback owner позволяет retry тем же key; old-contractor/revoked-access same-key replay не выдаёт stored success.
7. SubmitResult vs REWORK reassignment в обоих controlled lock orders: submit-first блокирует stale Select B; Select B-first немедленно отзывает A и блокирует submit/material/comment/download/replay; N+1 не увеличивается повторно. SubmitResult stale-iteration race использует canonical fixture/transition, без новой команды или illegal reassignment в EXECUTION.
8. Normal/demo exact notification recipient и validated chat snapshot; absent/unready/ambiguous normal mapping или unready demo recipient → readiness conflict, полный rollback. Fault injection на links/event/intent/finalize доказывает atomic Result+projection+EVT-008+intent+CommandExecution, без orphan success. Один persisted PENDING intent/result, response QUEUED; delivery failure после commit не меняет business facts; MAX transport spy не вызывается внутри transaction или TG-015 handler.
9. Общий AddComment: contractor только EXECUTION/REWORK; permitted Resident/UK paths, наблюдаемость УК, attachment-only permitted comment, empty comment reject, completed reject. Resident REMARKS_REVIEW reply требует same-Case/current Result/REMARK Feedback/iteration visible clarification target; missing/stale/foreign target denied. No private channel, no EVT-012 creation в TG-015.
10. Capability mint/authenticated stream/consume: exact attachment/principal/session/run, tampering/expiry/foreign scope rejection; после reassignment или binding/run revocation ранее minted URL denied; replay не renew expiry. No raw storage locator/broad secrets в responses/logs; bytes сохраняются в PostgreSQL.

После implementation выполнить целевые suites, `npm run typecheck`, `npm run build`, `npm test`, `git diff --check`; real-PostgreSQL suites запускать явно с configured test DB. Текущий root `npm run test:integration` в authoring base — **NO_SUITE_YET**, его exit 0 не evidence: если placeholder останется, требуется explicit targeted real-DB command и фактический suite result. Сейчас выполняется только authoring self-check: 12 sections, sources/SHA, graph, invariants, whitespace и единственный changed contract; runtime tests не запускались, их PASS не заявляется.

## 11. Git / integration handoff

Authoring: exact §1 base/branch, один contract file, self-check и **один independent CRITICAL review** без committed review artifact. Commit/push только `codex/tg-015-contract` с существующей человеческой Git identity; вернуть full contract SHA, remote SHA match и clean worktree. Не push/canonicalize `main`. При FIX_REQUIRED — один полный batch findings → один batch fix → targeted closure only. После review PASS и completion direct dependencies Integration Agent назначает implementation branch/base, сверяет final upstream SHA, current policy/kernel/domain/persistence seams и material changes TG-014; implementation и wave integration идут отдельными этапами. Этот контракт сам не снимает implementation gate.

## 12. Blocker protocol

При неверной базе/upstream SHA, несовместимости approved sources или фактических TG-007/011/012/014 interfaces, нарушении exact graph/write scope либо `SPEC CONFLICT` остановить затронутую работу и сообщить exact источник, расхождение и ответственного Integration Agent. Не исправлять чужие contracts/canonical docs/код и не выбирать новую semantics обходом. Незавершённая TG-014 блокирует implementation, но не текущий authoring/review; перед implementation обязательна upstream synchronization при material change.
