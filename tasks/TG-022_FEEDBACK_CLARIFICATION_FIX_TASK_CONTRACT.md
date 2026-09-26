# TG-022 — совместимость Resident feedback и clarification

`RISK_CLASS = STANDARD`; `BASE_SHA = b2805b197d1e3a8044ea3677af1c6fba68742114`.
Ветка: `codex/tg-022-feedback-clarification-fix`. База сверена с актуальным `origin/main` и HEAD.

## Цель и границы

До фиксации feedback обе серверные операции должны быть доступны для выбора.
Взаимоисключение относится к уже сохранённому Feedback. После success и 409
загружается authoritative snapshot; нет optimistic state, auto-retry или retarget.
Нормативны Product Freeze §§6–9, Product Spec §7.6–7.7 и Interface Contracts §18.
Зависимости TG-022: TG-021; unlocks: TG-028, TG-029. Task Graph не меняется.

Разрешённые изменения: Resident feedback, его тесты, тесты ResidentCaseView
и этот контракт. Backend, публичные contracts, root manifests/lockfile,
CreateCase options transport и продуктовые правила исключены.
Новые зависимости не требуются. Решение задачи и self-check выполняет один владелец.

## План и критерии приёмки

1. Добавить и запустить регрессии: both → обе кнопки; confirm-only;
   remark-only; none; success → authoritative refetch; общая блокировка
   confirm/remark до окончания refetch; 409 → refetch без повтора/retarget.
2. Удалить ошибочную проверку «оба действия противоречат друг другу»;
   сохранить точную проверку result/iteration. Success показывать по
   authoritative resident_feedback. Блокировать обе команды одной операцией.
3. Проверить snapshot/activity/actions на текущий clarification target.
   При отсутствии не угадывать по тексту или историческому comment_id.
4. Node 24.21.0 / npm 11.19.0: root typecheck, targeted tests, все web tests,
   root build, git diff --check. Commit/push только feature branch с человеческой
   Git identity; передать SHA, remote match, проверки и blocker Integration Agent.

## Clarification blocker

`CLARIFICATION_BACKEND_SEAM_REQUIRED = YES`.
`packages/contracts/src/reads.ts`: snapshot не содержит current clarification ID;
ADD_COMMENT имеет пустой target; CommentProjection содержит только comment_id,
body, created_at. Activity не содержит связи clarification с current Result/Feedback.
Внутренний authorization current_clarification_request_id не является публичной
проекцией для frontend. Существующий composer без authoritative target остаётся
заблокированным; backend seam должен предоставить текущий ID с контекстом актуальности.
При SPEC CONFLICT остановить затронутую работу; scope не расширять.
