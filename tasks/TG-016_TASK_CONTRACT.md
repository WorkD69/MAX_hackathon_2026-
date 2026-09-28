# TG-016 — Feedback, clarification, rework и completion branches

## 1. Identity / BASE_SHA

`TASK_ID = TG-016`; `RISK_CLASS = CRITICAL`; `Primary Ownership = LANE-B`; canonical contract delta base `28401166a340407297cfb942fd9a8bf978e6c2a2`. Implementation base назначается Integration Agent после dependency gate.

## 2. Goal

Реализовать feedback, clarification request/currentness, rework и три explicit completion branches без новых Case states. Сделать каждую clarification request самостоятельно адресуемой и согласованной с TG-015 reply и TG-017 Resident projection.

## 3. Canonical sources

Product Spec §§14–17, 22 и TR-008…TR-022; Data Model §§14–15, 20, 30–32; Interface Contracts §§17–23, 29; Task Graph TG-016. Product Freeze/Spec имеют приоритет.

## 4. Dependencies / unlocks

`Depends On = TG-014, TG-015`; `Unlocks = TG-017, TG-026`; `Parallel With = NONE` на последовательном Product E2E path.

## 5. Allowed write scope

Implementation: `apps/api/src/modules/cases/commands/feedback-resolution/**` и targeted tests. Этот contract file входит в согласованную canonical delta; central route composition принадлежит TG-029.

## 6. Forbidden scope

Нет production implementation в этой authoring delta. Не менять Product Freeze/Spec, Task Graph или восемь состояний; не создавать clarification table, auto-close, timer, Case при rework или дублирующий terminal event. Не требовать повторного принятия задания тем же executor.

## 7. Required behavior / invariants

- `RequestClarification` создаёт `Comment(CLARIFICATION_REQUEST)` с exact current Result/REMARK Feedback/iteration context, EVT-012 и `comment_id`, который является публичным `clarification_request_id`. В одном context допустимо несколько независимых unanswered requests. Новый запрос не закрывает старые.
- Request actionable для Resident только пока его Case доступен текущему Resident, state `REMARKS_REVIEW`, Result/REMARK Feedback/iteration остаются current и ещё нет первого `CLARIFICATION_REPLY` с `in_reply_to_comment_id = request.comment_id`. Ответ снимает actionable status только этого request; ReturnToRework, completion, смена context или утрата authority снимают соответствующие targets из Resident projection. История Comment/Event неизменяема.
- TG-015 `AddComment` под текущим Case context заново валидирует exact target. Stale видимый request — `409 CLARIFICATION_CONTEXT_REQUIRED`; hidden Case/resource — `404` до раскрывающей ошибки. Read capability не заменяет command validation.
- Формальные confirmation/remark взаимоисключающие; confirmation не закрывает Case. EVT-015 manual/unique без timer, поздний feedback инвалидирует no-feedback completion. ReturnToRework создаёт ровно N+1 с EVT-013/014; disputed completion создаёт EVT-017 без duplicate EVT-016; только UK завершает Case.

## 8. Dependency requests

`NONE`; TG-015 предоставляет единый Comment/attachment command seam, TG-017 строит read projection по canonical context.

## 9. Acceptance criteria

Два запроса в одном context оба видны как actionable; ответ на первый оставляет второй, повторный ответ на первый получает `409`; новый запрос не закрывает второй. После rework/completion/смены authority actionable список пуст или Case скрыт, история остаётся. Feedback/rework/completion соблюдают exact targets и event counts.

## 10. Required tests

После implementation: controlled feedback races, late feedback после EVT-015, rework vs disputed completion, late remark vs completion, multiple clarification requests/independent replies, stale/hidden target, repeated rework, completed terminal guard. Запустить targeted API/real PostgreSQL suites, root typecheck/build/test и `git diff --check`.

## 11. Git / integration handoff

Canonical authoring branch `codex/canonical-public-api-surface-delta` от указанного base; commit/push только coordinated delta, SHA и результаты проверок передать Integration Agent. Implementation получает отдельный назначенный base после dependencies; `main` не менять.

## 12. Blocker protocol

При `SPEC CONFLICT`, несовместимом shared contract или неверном implementation base остановить затронутую работу и передать конкретное расхождение владельцу/Integration Agent; продуктовые правила самостоятельно не менять.
