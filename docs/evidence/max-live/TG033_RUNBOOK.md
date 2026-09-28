# TG-033 — PREP runbook реальной проверки MAX

Статус документа: **PREP**. Этот файл задаёт порядок будущего live-прогона и не содержит результатов, `PASS` или вызовов MAX. Основа: [Task Graph TG-033](../../../tasks/TASK_GRAPH.md), TG-033 contract из commit `949a9e7b18a72a1a70eba9cb66d4951427b62191`, [Architecture §27](../../03_ARCHITECTURE.md), [Interface Contracts §§25, 27–28, 36](../../05_INTERFACE_CONTRACTS.md), [Product Spec AC-008/009](../../02_PRODUCT_SPEC.md). Записи наблюдений делать в [шаблоне](TG033_EVIDENCE_TEMPLATE.md).

## 1. Условия запуска и дисциплина evidence

1. Начинать TG-033 только после TG-032: зафиксированы доступный public HTTPS deployment, подтверждённая привязка Mini App к выданному боту организаторами после отправки URL через [форму](https://sbor-ssylok-dlya-mini-prilojeniy.testograf.ru/), judging account, подписка webhook, candidate Git SHA и immutable image digest. Собственный домен и «MAX для партнёров» не требуются. Локально допустимы web UI/logic tests; полноценное MAX testing — только после HTTPS и organizer binding. Сравнить candidate SHA с полем `build_sha` ответа `GET /api/v1/system/info`; несовпадение — `BLOCKED` для этого candidate. Записать безопасную метку окружения и URL без query/secrets.
2. Все live-наблюдения относятся к **одному** deployed candidate и его image digest. При исправлении дефекта **до дедлайна** и новом SHA открыть новый evidence set; старые `PASS` не переносить. После **30.09.2026 12:00 по Москве (UTC+03:00)** submitted version заморожена: новый SHA/image не разрешает её замену. Бот и решение должны оставаться доступными весь период экспертной проверки. Скриншоты браузерного viewport, fake MAX adapter, прямой URL и toast не заменяют реальный MAX client, запуск через Bot и доставленное сообщение.
3. Для **каждой** проверки записывать время с часовым поясом, candidate SHA, image digest, MAX client/platform/version, безопасную метку учётной записи, DemoRun/Case (где применимо), expected, actual, ссылку на обезличенный артефакт и статус `PENDING | PASS | FAIL | BLOCKED`. Исходно все проверки `PENDING`; заполнять только после исполнения. Отсутствие возможности наблюдать — `BLOCKED`, отрицательное наблюдение — `FAIL` с шагом воспроизведения.
4. Артефакты ограничить `docs/evidence/max-live/**`. Никаких Bot Token, webhook secret, session token, raw initData, приватных заголовков, персональных данных или рабочих credentials. Безопасные псевдонимы должны позволять сопоставить M/W и Case без раскрытия исходных ID. Перед commit проверить артефакты на секреты.

Нормативны [официальные уточнения FAQ](../../09_HACKATHON_CRITERIA.md#5-max-requirements), в том числе при расхождении с историческим TG-033 contract. Команда имеет технический Bot Token, а не Bot admin access; username узнаётся через `GET /me`. Webhook subscription/reconciliation выполняются по токену; настройки, недоступные через API, запрашиваются у организаторов. Имя, ник и логотип бота в онлайн-этапе участники не меняют.

## 2. Подготовка платформы и защитных границ

| ID | Будущая проверка | Ожидаемое наблюдение |
| --- | --- | --- |
| G-01 | TG-032 candidate, digest и `GET /api/v1/system/info` | Совпадение fixed candidate SHA и deployed `build_sha`; digest записан. |
| G-02 | Public Mini App URL, TLS/443, hostname и полная цепочка | HTTPS URL доступен из MAX; сертификат и цепочка принимаются MAX. |
| G-03 | Outbound TLS trust и связь backend с актуальным MAX Bot API | Реальный вызов работает без локальной подмены транспорта. |
| G-04 | Expected webhook subscription и контролируемая потеря/восстановление | Reconciliation находит и восстанавливает ожидаемую подписку. |
| G-05 | Organizer binding и доступность Bot, Mini App URL, judging account | Привязка после отправки формы подтверждена запуском из MAX; доступ сохраняется весь период экспертной проверки; секреты не попадают в evidence. |
| WH-01 | Webhook с валидным `X-Max-Bot-Api-Secret` | HTTP `200` не позднее 30 секунд; долгая бизнес-обработка не удерживает ответ. |
| WH-02 | Неверный и отсутствующий secret | Оба отклонены **до** бизнес-обработки; статус записать фактически. Конкретный HTTP-код не предписывать до интеграции canonical interface patch. |
| ID-01 | Подлинный raw MAX initData при запуске из Bot | Backend подтверждает HMAC и freshness, создаёт trusted session. В evidence только факт проверки. |
| ID-02 | Изменённый/невалидный и просроченный initData | Trusted session не выдаётся. |
| ID-03 | Прямой browser URL вне MAX | Trusted MAX session не выдаётся. |

`open_app` и optional `startapp/start_param` не служат доказательством identity linkage. Обязательный сценарий должен работать после обычного открытия Mini App без contextual payload.

## 3. Порядок DemoRun M → restore M → DemoRun W → restore W

Порядок обязателен для cross-client доказательства. `StartDemoRun` — только явное начало нового прогона; fresh bootstrap должен вернуть текущий run без создания нового.

1. **Mobile MAX, M (D-01).** Открыть Bot → Mini App; выполнить real initData bootstrap. Один раз вызвать StartDemoRun и безопасно обозначить полученный ACTIVE DemoRun как **M**. Создать primary Case **M-C**. Пройти обязательные действия через четыре ролевых представления, включая Result, реальное proactive сообщение и итоговое решение УК. Зафиксировать историю и счётчики Result/EVT-008/intent для этого SubmitResult. Ни один шаг не должен требовать desktop-only действия.
2. **Web MAX, сначала restore M (D-02).** Открыть Bot → Mini App в web MAX и выполнить **fresh bootstrap без StartDemoRun**. До любых действий нового прогона доказать, что server context вернул **тот же** ACTIVE M и M-C; сверить безопасные метки, Case history и current context. Reload web также не создаёт run. Это обязательная точка доказательства, предшествующая W.
3. **Web MAX, затем W (D-03).** Только после зафиксированного D-02 вызвать StartDemoRun **один раз** для repeatability. Новый ACTIVE DemoRun **W** архивирует только статус M; M-C и его история не переписываются. Создать новый primary Case **W-C** и пройти полный обязательный сценарий в web MAX, включая Result, сообщение и итоговое решение УК. Ровно четыре role views; Contractor A/B — server-side actors одной роли.
4. **Mobile MAX, restore W (D-04).** После web-прогона снова открыть Mini App в mobile MAX, выполнить fresh bootstrap **без StartDemoRun** и доказать возврат **того же** W/W-C, текущего контекста и истории. Reload не создаёт третий run. Старый M-C не становится current Case и не изменяется.

V-04 фиксирует обе стороны D-02/D-04 и соответствующие пути скачивания. Для каждого клиента нужны реальные MAX client/version и артефакт; один клиент не подтверждает другой. При ошибке в порядке M → restore M → W → restore W не выдавать cross-client `PASS`.

## 4. V-01…V-04 и обязательное сообщение

| ID | Будущая проверка | Ожидаемое наблюдение |
| --- | --- | --- |
| V-01 | Наличие/отсутствие contextual payload `open_app` отдельно в mobile и web MAX | Записано фактическое различие или совпадение; MUST-flow работает без payload. |
| V-02 | Mini App `user.id` и Bot API `user_id` на live account | Записан только обезличенный факт равенства/неравенства или недоступности наблюдения. Равенство **не** является условием успеха. Доставка опирается на validated signed `chat.id/chat.type`, не `user.id == user_id`. |
| V-03a | Доставка в обычном состоянии Bot/dialog | Реальный `POST /messages` доставил проверяемое MAX сообщение по validated target. |
| V-03b | Доставка после возврата пользователя в Mini App | То же наблюдение после возврата; сообщение видно в MAX, а не только в UI/log. |
| V-03c | Доставка после паузы | То же наблюдение после паузы; записать интервал и фактический исход. |
| V-04 | Mobile/web launch, fresh restore и native/web download | D-02/D-04 сохраняют current run/Case; оба client-specific download пути работают. |

V-03 может требовать отдельных подготовленных Result/прогонов для трёх состояний диалога. Каждый такой SubmitResult проверяется отдельно по правилу «один Result — один EVT-008 — один NotificationIntent»; повторная отправка того же бизнес-Result ради уведомления запрещена. Подтверждение включает обезличенное входящее MAX сообщение «Подрядчик сообщил о выполнении. Проверьте результат» и связь с соответствующим intent/Result. Для DEMO_MODE target — explicit `DemoRun.notification_recipient_max_identity_id` и его validated `delivery_chat_id/type`; для normal mode — единственный outbound-ready MaxIdentity, связанный с Resident. Не выбирать произвольную группу, канал, first/latest chat или синтетического Resident в качестве test target.

## 5. Материалы, retry и redrive

| ID | Будущая проверка | Ожидаемое наблюдение |
| --- | --- | --- |
| UI-01 | Ровно четыре role views в mobile и web | `RESIDENT`, `UK_EMPLOYEE`, `UK_ADMIN`, `CONTRACTOR_EMPLOYEE`; A/B выбирает сервер. |
| UI-02 | Photo picker в mobile MAX | Реальное фото выбирается и попадает в разрешённый upload/Result path. |
| UI-03 | File picker в mobile MAX | Реальный файл выбирается и попадает в разрешённый upload/Result path. |
| UI-04 | Photo picker в web MAX | Выбор фото работает в web MAX. |
| UI-05 | File picker в web MAX | Выбор файла работает в web MAX. |
| DL-01 | Mobile download | После авторизации выдаётся short-lived scoped capability; `window.WebApp.downloadFile(download_url,file_name)` скачивает материал. |
| DL-02 | Web MAX download | После авторизации материал скачивается через поддерживаемый browser path/capability; raw storage URL не раскрывается. |
| NT-01 | Result → notification | Valid SubmitResult атомарно создаёт один Result, один EVT-008 и один `(result_id, RESULT_READY)` intent; сообщение доставляется в real MAX. |
| NT-02 | Temporary network/429/5xx retry | Тот же intent переходит в `RETRY` с backoff и затем доставляется; второй Result/EVT-008/intent не создаётся. |
| NT-03 | `PERMANENT_FAILURE` → config fix → redrive | Team-only operational reconciliation переводит **тот же** intent в `RETRY` после исправления конфигурации и доставляет; `operational_redrive_count` меняется, Result/EVT-008/intent остаются единственными. |

Для NT-02/NT-03 сохранить безопасное сопоставление ID и количество записей до/после. Отказ уведомления после commit не откатывает Result, не меняет Case state и не требует нового SubmitResult. Настройки/секреты исправляет ответственная команда вне evidence; в документе хранится только факт исправления и outcome, без значений.

## 6. Scope A→B и завершение

`A→B` обязателен как **TG-035 E2E/API evidence** для переназначения и прав доступа, но **не** является дополнительным обязательным live flow TG-033. В TG-033 фиксируется только это разграничение (`SC-01`); если A→B фактически демонстрировался, наблюдение можно приложить без превращения его в gate TG-033.

Сверить полноту [шаблона](TG033_EVIDENCE_TEMPLATE.md) и связи каждого `PASS` с артефактом. Mandatory path failure в webhook, auth, notification, mobile/web или download — `INTEGRATION BLOCKER`; указать owning task и новый candidate SHA после исправления. TG-033 не меняет продуктовые правила и не подменяет доказательство исходниками, browser test или fake transport. Передача TG-034 возможна только с датированным реальным evidence для зафиксированного candidate.
