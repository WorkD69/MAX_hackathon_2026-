# Известные ограничения и непроверенные условия сдачи

Application source of truth: `332ac4aee174a8743324b82b38853b3a3751d2e9`.
Итоговый submission commit добавляет только delivery/config/documentation artifacts.
Наличие Dockerfile и API-документов само по себе не подтверждает запуск или live интеграцию.
Фактический статус каждого условия фиксируется в [checklist](SUBMISSION_CHECKLIST.md).

## Ограничения MVP

- Сценарий — один неаварийный жилищный случай в MAX: житель, УК и подрядчик, восемь утверждённых
  состояний, одна история Case и доработка в следующей итерации того же Case.
- `DEMO_MODE=true` использует SYNTHETIC каталог и четыре role views. Это экспертный сценарий,
  а не production enrollment или доступ к реальным данным жителей.
- Seed `tg008.v1` содержит сантехнику и электрику. Для приоритетной демонстрации отопления/стояка
  UK Admin создаёт SYNTHETIC категорию с доступом в помещение и требованием PHOTO. Это конфигурация
  справочника; seed и product scope не меняются.
- Нет CRM/ГИС ЖКХ интеграции, официальной регистрации обращения в ГИС, платежей, юридически значимых
  актов/подписей, универсальных SLA, live интеграции свободных слотов и маршрутизации мастеров.
- MAX notification outbox доставляется с семантикой at-least-once. Сбой MAX после commit Result
  не откатывает Result; повторная попытка доставки не должна создавать второй бизнес-результат.
- Структурная JSON Schema не выражает все Zod refinements, idempotency fingerprint и проверки
  полномочий внутри транзакции. Для API нужны validator и фактические HTTP проверки.

## Условия, требующие evidence

| Условие | Что подтвердить |
| --- | --- |
| Docker из clean checkout | `docker compose up --build`, успешные migrations, повторный idempotent seed, readiness и web/API |
| Время сборки | Не более 300 секунд без первоначального pull; сохранить машину, cache и время |
| PostgreSQL | Нет внешнего `ports:`; данные Case/history/attachment сохраняются после `down`/`up` |
| API package | Final method/path/schema/auth/body parity между onRoute registry, OpenAPI и DATA-API; никаких stale routes |
| BUILD_SHA | Собранный из submission commit образ возвращает его полный SHA в `/api/v1/system/info` |
| MAX и HTTPS | Bot → Mini App в web/mobile, signed initData, webhook, Bot API notification и download; обезличенное live evidence |
| VPS CA | Read-only mount доверенного CA, TLS verification включена, Caddy проксирует на loopback app |
| Безопасность | Secret scan всего submission tree и отдельный просмотр evidence/PDF на реальные credentials/PII |
| Презентация | Финальный PDF, технический первый слайд с URL, Git SHA и маршрутом проверки |

Production уже использует application SHA `332ac4aee174a8743324b82b38853b3a3751d2e9` и проходит
отдельный final smoke пользователя. Пока production не пересобран из submission commit, его
`build_sha` может отличаться от нового submission SHA; это следует записывать как два разных факта.
Не помечать `REMOTE_SHA_MATCH`, Docker persistence или live MAX проверки как PASS без измерения.

Pattern secret scan выявляет распространённые форматы токенов и private keys, но не доказывает
отсутствие неизвестных форматов или секретов в истории Git. Финальный ZIP проверяется отдельно.
