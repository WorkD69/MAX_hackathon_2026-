# Известные ограничения и результаты проверки

Application source of truth: `332ac4aee174a8743324b82b38853b3a3751d2e9`.
FINAL_SUBMISSION_SHA проверенного source package: `4f719b0d9d2f40cee8ab16c61b86b40b63ca7d72`.
Cleanup меняет только документацию и PDF. Новый Git SHA cleanup commit указывается в итоговом отчёте;
он не означает изменение application code.

## Ограничения MVP

- Первичная модерация и отклонение УК некорректного или непрофильного обращения до принятия в работу в текущем MVP не реализованы. MVP сфокусирован на сквозном процессе принятого обращения: Житель → УК → Подрядчик → проверка результата.
- Сценарий охватывает один неаварийный жилищный Case в MAX: житель, УК, подрядчик, восемь
  утверждённых состояний, история и доработка следующей итерацией того же Case.
- `DEMO_MODE=true` использует SYNTHETIC каталог и четыре role views; это экспертный сценарий,
  не production enrollment и не доступ к реальным данным жителей.
- Seed `tg008.v1` содержит сантехнику и электрику. Для демонстрации отопления/стояка UK Admin
  создаёт SYNTHETIC категорию с доступом в помещение и PHOTO requirement через конфигурацию.
- Нет CRM/ГИС ЖКХ интеграции, официальной регистрации обращения в ГИС, платежей, юридически
  значимых актов/подписей, универсальных SLA, live слотов и маршрутизации мастеров.
- MAX notification outbox доставляется с семантикой at-least-once. Сбой MAX после commit Result
  не откатывает Result; повторная доставка не создаёт новый бизнес-результат.
- OpenAPI/JSON Schema не выражают все Zod refinements, правила idempotency и полномочия внутри
  транзакции. Method/path parity и schema validation не заменяют authenticated HTTP и live MAX smoke.

## Подтверждённое для source package

| Проверка | Результат |
| --- | --- |
| Docker из clean checkout | `PASS`: `docker compose up --build -d`, migrations, повторный idempotent seed, web/API/readiness |
| Build time | `PASS`: 30.1 s, `--no-cache`, initial image pulls исключены; цель ≤300 s |
| PostgreSQL | `PASS`: host port не опубликован; DB volume probe сохранён после `down`/`up` |
| API docs | `PASS`: OpenAPI 3.1 schema/semantic validation, 45/45 runtime method/path routes, 46 DATA-API checks |
| BUILD_SHA | `PASS`: `/api/v1/system/info` вернул полный source commit SHA `4f719b0…` |
| Security | `PASS`: Gitleaks по submission ZIP, 0 secrets; `.env` и production credentials исключены |
| Remote | `PASS`: source branch и tag `submission-final-2026-09-30` указывают на `4f719b0…` |
| Презентация | `PASS`: финальный PDF, 13 слайдов; полный source SHA на первом слайде |
| ZIP | Присутствует, открывается, меньше 50 MB; SHA-256 передаётся отдельно |

Локальная persistence проверка подтверждает named PostgreSQL volume через отдельную контрольную запись.
Она не утверждает, что конкретный Case/history/attachment прошёл end-to-end проверку после restart.
MAX Bot → Mini App в web/mobile, signed initData, реальная доставка уведомления и download требуют
отдельного final smoke пользователя. Production ещё может возвращать application SHA `332ac4…`, пока
его не пересобрали из source submission commit; это не ошибка локального BUILD_SHA теста.

Gitleaks покрывает известные форматы секретов. Он не доказывает отсутствие неизвестных форматов или
секретов в истории Git. Итоговый PDF и ZIP проверяются отдельно на рабочие credentials и PII.
