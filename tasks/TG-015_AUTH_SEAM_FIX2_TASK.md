# TG-015 Authorization Seam Batch Fix 2

## BASE_SHA

`181fdc25b11887319a8e49c64d1ece9a7b571dc6`

## Цель и контекст

Закрыть замечания F1/F2 к authorization seam. Нормативны `docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md` и `docs/05_INTERFACE_CONTRACTS.md`. В `REMARKS_REVIEW` текущее замечание рассматривает УК; исполнитель получает вложение замечания лишь через релевантный источник текущей итерации после `RETURN_TO_REWORK`.

## Объём и границы

Разрешены `apps/api/src/modules/authorization/policy.ts`, `apps/api/src/modules/authorization/policy.test.ts`, `apps/api/tests/attachment-authorization.integration.test.ts` и этот локальный контракт. Не менять canonical product/interface docs, команды TG-015, модель ролей и состояний, endpoints или `main`. Зависимость: проверяемая база выше.

## Критерии приёмки

- Вложения `ResidentRemark`, включая прежний источник итерации, скрыты от исполнителя в `REMARKS_REVIEW`; Resident и УК сохраняют доступ в своём scope.
- В `REWORK` актуальный исполнитель видит вложение только того замечания, которое является `source_feedback_id` текущей итерации. Старое назначение и посторонняя история скрыты.
- Доступ к вложениям комментариев не расширен и не сломан.
- Текущий seam предоставляет повторяемую policy-проверку. Реальных обработчиков выпуска и использования download capability здесь нет; `CAPABILITY_REAUTH` end-to-end не заявляется.

## Будущая приёмка TG-015 capability

Реальный интеграционный тест должен пройти через **mint и consume** обработчики, изменить права между ними и подтвердить отказ старому подрядчику при consume. Проверить TTL, привязку capability к вложению и субъекту, а также актуальный контекст родительского Feedback/Comment при обоих действиях. Две прямые проверки `AuthorizationPolicy.attachment()` не заменяют этот тест.

## Проверки и эскалация

Использовать Node `24.21.0` и npm `11.19.0`: TG-011 policy tests, TG-012 classifier tests, реальный PostgreSQL classifier, root tests, typecheck и build. При конфликте с Product Freeze/Spec остановиться с `SPEC CONFLICT`; при несовпадении базы или выходе за перечисленные файлы остановиться. После проверок: commit и push в `codex/tg015-auth-seam-fix2`, вернуть SHA.
