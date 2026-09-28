# Ограничения baseline deployment

Delivery synchronized against SOURCE_SHA `5045dd220b85bbd89038821aac110ec46c44a9d3`.
Actual factory registry: 45 documented operations. Canonical schemas используются без pending read fallback.
Продуктовый код сохранён; UX fixes не входят в задачу.

`ORGANIZER_FORM=DEFERRED_BY_USER`: форма изучена, данные не заполнялись и отправка не выполнялась.
Обязательные поля: фамилия/имя капитана, регистрационный email капитана, название команды,
ссылка на мини-приложение. Постоянный URL: https://157-22-231-21.sslip.io/.

До organizer binding нельзя подтвердить native Bot → Mini App launch, настоящий platform initData,
HMAC/freshness для реального launch, session bootstrap внутри MAX и DEMO_MODE в MAX.
Обычное открытие HTTPS без initData не предоставляет authenticated demo session.
GET /me, outbound TLS, subscription и real bot webhook можно проверить отдельно от binding.
Mobile/web parity и полная product UX acceptance — отдельные gates.

`PRESENTATION_DRAFT.pdf` и `presentation.json` — исторические материалы draft, не финальная подача.
Их утверждения о pending TG-029 не описывают этот deployment candidate.
Итоговое фактическое evidence фиксируется в PUBLIC_MAX_SMOKE.md после live проверок.
