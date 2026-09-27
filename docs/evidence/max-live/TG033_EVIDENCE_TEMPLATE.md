# TG-033 — PREP шаблон live evidence

**Все строки ниже — `PENDING`; реальных наблюдений и runtime `PASS` здесь нет.** Рабочая копия заполняется при исполнении [runbook](TG033_RUNBOOK.md) после TG-032. Одна строка = одна проверка. Для повторов (например, V-03/NT-02) добавить строки с тем же ID и номером попытки; не затирать предыдущий outcome.

## Правила заполнения

- `Время + зона`: ISO-подобная дата и время с явным `+03:00`/другой зоной; не подставлять дату создания шаблона.
- `Candidate SHA`: полный Git SHA, совпадающий с полем `build_sha` ответа `GET /api/v1/system/info`; `Image digest`: immutable digest фактического image из TG-032. Оба поля обязательны для live-строки.
- `Клиент / версия`: MAX mobile/web, платформа и версия, если доступна; для backend/platform check указать контекст и версию применимого клиента или `не применимо` с причиной.
- `Аккаунт`: только безопасная метка. `DemoRun / Case`: безопасные стабильные метки M, M-C, W, W-C или `не применимо`; не публиковать исходные ID без необходимости.
- `Ожидалось` уже задано. `Фактически` содержит точное наблюдение, включая отрицательный результат; `Артефакт` — относительная ссылка внутри `docs/evidence/max-live/**` или безопасная внешняя evidence reference. `PASS` возможен только после фактического live-наблюдения и заполнения всех применимых полей. Нет доступа/условий — `BLOCKED`, отрицательный результат — `FAIL`.
- Секреты, raw initData, токены, приватные заголовки, query и персональные данные не записывать. Перед commit проверить все ссылки и изображения. HTTP-статус неверного/отсутствующего webhook secret записать как наблюдение, не требовать конкретного кода до canonical interface patch.

## Журнал проверок

Во всех строках `—` означает «ещё не заполнено». Для неприменимых полей при исполнении записать `не применимо` и причину. Столбец `Статус` допускает только `PENDING | PASS | FAIL | BLOCKED`.

| ID | Время + зона | Candidate SHA | Image digest | Клиент / версия | Аккаунт | DemoRun / Case | Ожидалось | Фактически | Артефакт | Статус |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G-01 | — | — | — | — | — | — | `build_sha` совпал с candidate; digest зафиксирован | — | — | PENDING |
| G-02 | — | — | — | — | — | — | Public HTTPS/443, hostname и полная цепочка приняты MAX | — | — | PENDING |
| G-03 | — | — | — | — | — | — | Outbound TLS/Bot API работает | — | — | PENDING |
| G-04 | — | — | — | — | — | — | Подписка восстановлена reconciliation после loss | — | — | PENDING |
| G-05 | — | — | — | — | — | — | Bot, Mini App URL и judging account доступны | — | — | PENDING |
| WH-01 | — | — | — | — | — | — | Валидный secret: HTTP 200 ≤30 с | — | — | PENDING |
| WH-02 | — | — | — | — | — | — | Неверный и отсутствующий secret отклонены до бизнес-обработки | — | — | PENDING |
| ID-01 | — | — | — | — | — | — | Реальный initData прошёл HMAC/freshness | — | — | PENDING |
| ID-02 | — | — | — | — | — | — | Невалидный/просроченный initData отклонён | — | — | PENDING |
| ID-03 | — | — | — | — | — | — | Прямой URL не даёт trusted MAX session | — | — | PENDING |
| D-01 | — | — | — | — | — | — | Mobile один раз создал M/M-C и прошёл обязательный сценарий | — | — | PENDING |
| D-02 | — | — | — | — | — | — | Web fresh bootstrap восстановил M/M-C **до** StartDemoRun W | — | — | PENDING |
| D-03 | — | — | — | — | — | — | Web после D-02 создал W/W-C и прошёл repeat flow | — | — | PENDING |
| D-04 | — | — | — | — | — | — | Mobile fresh bootstrap восстановил W/W-C без нового run | — | — | PENDING |
| V-01 | — | — | — | — | — | — | `open_app` context наблюдён отдельно в mobile/web; MUST от него не зависит | — | — | PENDING |
| V-02 | — | — | — | — | — | — | Равенство `user.id`/`user_id` описано observationally; delivery от него не зависит | — | — | PENDING |
| V-03a | — | — | — | — | — | — | Сообщение доставлено в обычном Bot/dialog состоянии | — | — | PENDING |
| V-03b | — | — | — | — | — | — | Сообщение доставлено после возврата в Mini App | — | — | PENDING |
| V-03c | — | — | — | — | — | — | Сообщение доставлено после паузы | — | — | PENDING |
| V-04 | — | — | — | — | — | — | Оба restore и mobile/web download подтверждены | — | — | PENDING |
| UI-01 | — | — | — | — | — | — | Четыре role views; A/B выбирает backend | — | — | PENDING |
| UI-02 | — | — | — | — | — | — | Mobile photo picker работает | — | — | PENDING |
| UI-03 | — | — | — | — | — | — | Mobile file picker работает | — | — | PENDING |
| UI-04 | — | — | — | — | — | — | Web photo picker работает | — | — | PENDING |
| UI-05 | — | — | — | — | — | — | Web file picker работает | — | — | PENDING |
| DL-01 | — | — | — | — | — | — | Mobile scoped capability + native download работает | — | — | PENDING |
| DL-02 | — | — | — | — | — | — | Web authorized download работает | — | — | PENDING |
| NT-01 | — | — | — | — | — | — | Один Result/EVT-008/intent; real MAX delivery по validated target | — | — | PENDING |
| NT-02 | — | — | — | — | — | — | Temporary retry доставил через тот же intent без новых бизнес-фактов | — | — | PENDING |
| NT-03 | — | — | — | — | — | — | Config fix + `PERMANENT_FAILURE → RETRY` redrive того же intent | — | — | PENDING |
| SC-01 | — | — | — | — | — | — | A→B отнесён к TG-035 E2E/API, не к mandatory live TG-033 | — | — | PENDING |

## Связи артефактов при исполнении

Для D-02 приложить сравнение M/M-C **до** D-03; для D-04 — W/W-C после D-03. Для V-03a/b/c и NT-01/02/03 указать безопасное соответствие конкретного Result, EVT-008, `NotificationIntent` и входящего MAX сообщения; каждый SubmitResult имеет ровно по одному Result/EVT-008/intent. Для WH-02 подтвердить отсутствие бизнес-эффекта. `SC-01` — проверка границы scope документа, а не live-тест A→B; при материализации она остаётся `PENDING` до исполнения комплекта.
