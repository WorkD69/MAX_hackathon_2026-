# Baseline verification

Mini App entrypoint: https://157-22-231-21.sslip.io/.
Bot: https://max.ru/t792_hakaton_max_bot.
SOURCE_SHA: `5045dd220b85bbd89038821aac110ec46c44a9d3`.

1. Открыть HTTPS и проверить отсутствие ошибок assets/mixed content.
2. GET `/health/live`, `/health/ready`, `/api/v1/system/info`: process, DB/migrations, deployed SHA.
3. Без session GET `/api/v1/cases` возвращает canonical 401.
4. Production container GET /me и GET /subscriptions через явный доверенный CA.
5. Webhook: missing/invalid secret → canonical 401; valid secret → 200 <30 sec.
6. Реально запустить bot в MAX и сопоставить пришедший webhook/ответ бота с серверным evidence.
7. После organizer binding открыть Mini App из MAX: raw initData → server HMAC/freshness → session.
8. Начать demo, выбрать Resident, создать/прочитать SYNTHETIC Case, переключить UK и Contractor.
   IDs брать из текущих options/snapshot; новый token после switch/start. Историю не удалять.
9. Полные happy path/rework/A→B выполнять отдельно от этого baseline compatibility smoke.

Форма отложена пользователем; это не platform failure. До binding real initData/native Mini App
checks остаются WAITING_BINDING. Подписанное вручную initData или тестовый transport нельзя
выдавать за real MAX evidence. OpenAPI и DATA-API задают методы, schemas и необходимые роли.

Persistent DB проверяется через compose down/up без удаления named volume и сравнением данных.
Не публиковать Bot Token, webhook/session/DB secrets, initData, capability URL или session token.
