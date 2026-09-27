# TG-015 — Execution, comments, attachments, Result и outbox intent

## 1. Identity / BASE_SHA

`TASK_ID = TG-015`; `RISK_CLASS = CRITICAL`; `Primary Ownership = LANE-B`; canonical contract delta base `28401166a340407297cfb942fd9a8bf978e6c2a2`. Implementation base назначается Integration Agent после dependency gate.

## 2. Goal

Реализовать рабочую фазу Case до атомарного `SubmitResult`: comments, result materials, безопасные attachment capabilities, Result и ровно один durable notification intent. Для clarification reply TG-015 владеет общим `AddComment` и связью Comment с точным target.

## 3. Canonical sources

Product Spec §§9.4–9.6, 11, 13 и TR-014/020–022; Data Model §§15–16, 19.3, 32; Interface Contracts §§15A, 16, 23, 26, 28.1–28.3; Task Graph TG-015. Product Freeze/Spec имеют приоритет.

## 4. Dependencies / unlocks

`Depends On = TG-007, TG-014`; `Unlocks = TG-016`; `Parallel With = TG-022` после TG-014, без конкурентной правки shared registration.

## 5. Allowed write scope

Implementation: `apps/api/src/modules/cases/commands/execution/**`, `apps/api/src/modules/attachments/**`, соответствующие attachment repositories и targeted tests. TG-029 выполняет central route composition. Этот contract file входит в согласованную canonical delta.

## 6. Forbidden scope

Нет production implementation в этой authoring delta. Не менять Product Freeze/Spec, Task Graph, auth/kernel, чужие modules, raw storage URL, MAX worker или отдельную таблицу clarification. Не создавать private Resident↔Contractor channel и не передавать authority из read projection в command.

## 7. Required behavior / invariants

- `AddComment` сохраняет единую ленту. Resident в `REMARKS_REVIEW` отвечает только на exact `clarification_request_id = Comment.comment_id` запроса `CLARIFICATION_REQUEST`; успешный reply — `Comment(CLARIFICATION_REPLY)` с `in_reply_to_comment_id` и inherited Result/Feedback/iteration context. Ответ и EVT-007 атомарны; повторная submission с другим key на уже отвеченный target получает `409 CLARIFICATION_CONTEXT_REQUIRED` после visibility check.
- Несколько requests одного current context могут сосуществовать. Первый reply снимает actionable status только своего target; новые requests не закрывают другие. TG-016 определяет currentness, TG-017 проецирует actionable список, TG-015 не вводит отдельный storage или state.
- Только current executor добавляет рабочие материалы/SubmitResult. Material alone не меняет state; PHOTO/FILE проверяются по Case snapshot; Result, EVT-008 и один NotificationIntent атомарны после defensive recipient readiness check. Download capability ограничен scope и сроком; old contractor не получает LIVE download.

## 8. Dependency requests

`NONE`; использовать TG-002 `AddCommentPayloadSchema` и общий TG-012 command kernel. Семантика current context — Interface §23 и TG-016.

## 9. Acceptance criteria

Exact clarification reply с target сохраняет `in_reply_to_comment_id`; повторный/stale target отклоняется без нового Comment/Event, hidden resource даёт `404`. Разрешённые comments видны в единой activity; Result/intent имеют указанную атомарность, материалы доступны только текущему субъекту.

## 10. Required tests

После implementation: target/currentness и две независимые clarification requests, первый reply на одну из них, duplicate/stale/hidden target; comment/attachment authorization; MIME/size/hash, capability expiry/scope, duplicate Result, notification-not-ready rollback, N+1 same executor. Запустить targeted API/real PostgreSQL suites, root typecheck/build/test и `git diff --check`.

## 11. Git / integration handoff

Canonical authoring branch `codex/canonical-public-api-surface-delta` от указанного base; commit/push только coordinated delta, SHA и результаты проверок передать Integration Agent. Implementation получает отдельный назначенный base после dependencies; `main` не менять.

## 12. Blocker protocol

При `SPEC CONFLICT`, несовместимом shared contract или неверном implementation base остановить затронутую работу и передать конкретное расхождение владельцу/Integration Agent; продуктовые правила самостоятельно не менять.
