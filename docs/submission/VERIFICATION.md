# Независимая проверка экспертом

`FINAL_SYNC_REQUIRED = YES`. Следующая процедура — acceptance runbook для final TG-029 candidate.
На базе draft отсутствие product routes/readiness не является PASS. Сначала закрыть gates из
[KNOWN_LIMITATIONS](KNOWN_LIMITATIONS.md), заполнить Bot/Mini App/API URLs и submission SHA в README.
Нужны MAX mobile и web, интернет, доступ к демо и приблизительно 15–25 минут; это плановая оценка,
не измеренное время. Все business data здесь SYNTHETIC.

## 1. Доступ, version и readiness

1. Открыть Bot по ссылке README, нажать кнопку Mini App. Выполнить в MAX web и mobile.
2. Публично проверить `GET <API_HTTPS_ORIGIN>/health/live`: 200, `{"status":"ok"}`.
3. `GET <API_HTTPS_ORIGIN>/health/ready`: 200, `status=ready`,
   `checks.database=up`, `migrations=current`, `application=initialized`.
   503/not_ready — остановить product verification и записать failure.
4. `GET <API_HTTPS_ORIGIN>/api/v1/system/info`: 200, только public `build_sha`.
   Сравнить **полностью** с `SUBMISSION_SHA` на первом слайде/README. Несовпадение — FAIL.
5. Bootstrap `POST /api/v1/auth/max` через UI с raw signed MAX initData.
   Успех 200, новый `session_token`, `expires_at`, `session.real_max_identity`, `demo_mode=true`.
   Не сохранять raw initData/token в Git, PDF или скриншоты.
6. Все protected API requests: `Authorization: Bearer <runtime token>`. Каждая mutation, кроме
   auth bootstrap/webhook, имеет новый `Idempotency-Key` на новый intent; network retry того же
   intent использует прежний key, body, exact IDs и file bytes.

Изолированный fake/test-signing auth профиль не заменяет шаги 1/5 и live notification.
Полные bodies и schemas — [DATA-API.yaml](../../DATA-API.yaml), [OpenAPI](../../openapi.yaml).

## 2. Новый run и подготовка справочника

1. Нажать «Новый DemoRun»: `POST /api/v1/demo/runs` с
   `{"scenario_key":"primary-housing-demo"}`, expected 201.
   Сохранить `demo_run_id`; `primary_case_id=null`. В final response должны быть **новый session token**
   и actor-null session для этого run. Если токена нет, это незакрытый start/session seam, не продолжать
   с token старого run. После start выбрать роль отдельным switch.
2. `POST /api/v1/demo/session/actor` с `{"role_view":"UK_ADMIN"}` → 200;
   применять token из switch response во всех следующих запросах.
3. Прочитать `GET /api/v1/config/organization`, `/houses`, `/categories`, `/contractors`, `/users`.
   Все ответы своей УК, только SYNTHETIC каталог. Другая role view не получает admin config.
4. Если SYNTHETIC отопительной категории ещё нет, создать через UI или
   `POST /api/v1/config/categories`, expected 201, body из `CategoryCreate` DATA-API check.
   Выбрать активного Contractor A, `requires_premises_access=true`, `result_requirement=PHOTO`.
   Сохранить category ID. Seed по умолчанию содержит сантехнику и электрику; не выдавать их за
   отопительную категорию и не менять fixture product code.

## 3. Создание → приём → поручение

| Шаг | Role / exact API | Ожидаемое |
| --- | --- | --- |
| Выбрать Resident | `POST /api/v1/demo/session/actor`, `role_view=RESIDENT` | Новый token, same run |
| Помещение | `GET /api/v1/cases/create-options` | Только доступные помещения, categories пусты без selection |
| Категории | `GET /api/v1/cases/create-options?premises_id=<current>` | Активная SYNTHETIC отопительная категория |
| Создать | `POST /api/v1/cases`, multipart `payload={premises_id,category_id,description}` | 201, `state=CREATED`, `revision=1`, `created.iteration_id`; сохранить case_id |
| Перечитать | `GET /api/v1/cases/{caseId}` | Одна карточка, initial attachments/activity/allowed_actions |
| Роль УК | Switch `UK_EMPLOYEE` | Новый token |
| Принять | `POST .../commands/accept`, `{}` | 200, `ACCEPTED_BY_UK` |
| Кандидаты | `GET /api/v1/cases/{caseId}/contractor-candidates` | `iteration_id`, eligible `items[]` своей УК |
| Выбрать A | `POST .../commands/select-contractor`, `{contractor_id,iteration_id}` | 200, `created.selection_id`; выбор не равен отправке/принятию |
| Отправить | `POST .../commands/send-assignment`, `{selection_id,iteration_id}` | 200, `SENT_TO_CONTRACTOR`, `created.assignment_id` |
| Подрядчик | Switch `CONTRACTOR_EMPLOYEE` | Backend выбирает pending A; одна role view |
| Принять Assignment | `POST .../commands/accept-assignment`, `{assignment_id}` | 200, `EXECUTION`, A — current executor |

После каждой command success или 409 перечитать snapshot. Не retarget'ить stale запрос автоматически.
Не писать `state`, executor или current pointers через generic PATCH.

## 4. Материал → Result → реальное уведомление

1. Получить current `assignment_id`/`iteration_id` из snapshot/allowed_actions.
2. `POST /api/v1/cases/{caseId}/result-materials`, multipart JSON `payload={assignment_id,iteration_id}`
   и **ровно один** binary `files` part: [synthetic-result.png](synthetic-result.png).
   Expected 200, `created.attachment_id`, event_ids; state не меняется. File SYNTHETIC, не фото ремонта.
3. `POST .../commands/submit-result` с current IDs, synthetic description,
   `material_attachment_ids=[<полученный attachment_id>]` → 200, `AWAITING_RESULT_CHECK`,
   `created.result_id`, `created.notification_intent_id`, `notification.status=QUEUED`.
4. Проверить настоящее Bot API уведомление в MAX о готовом Result. Записать время и обезличенное evidence.
   QUEUED в API не равно доставке. При сбое MAX Case остаётся `AWAITING_RESULT_CHECK`; не отправлять
   второй Result для повторной доставки. Исправление/redrive выполняет команда.
5. Switch Resident, открыть Result, проверить attachment preview и download через
   `POST /api/v1/attachments/{attachmentId}/download-capability` с Idempotency-Key.
   Expected 200: короткоживущий HTTPS `download_url`, `file_name`, `expires_at`.
   Проверить actual download в обоих MAX клиентах; UI использует native Bridge/web path.

## 5. Замечание → N+1 того же Case → подтверждение → завершение

1. Resident: `POST .../commands/resident-remark`, multipart
   `payload={result_id,iteration_id,remark_text:"[SYNTHETIC] Неисправность остаётся."}` → 200,
   `REMARKS_REVIEW`, `created.feedback_id`. Сохранить exact result/feedback IDs.
2. УК может `POST .../commands/request-clarification` с `{result_id,feedback_id,message}` → 200.
   Resident отвечает `POST /api/v1/cases/{caseId}/comments`, multipart payload с `body` и
   `clarification_request_id=<current actionable clarification ID>`. Ответ виден в той же activity.
3. УК: `POST .../commands/return-to-rework` с `{result_id,feedback_id}` → 200, `REWORK`,
   `created.iteration_no=N+1`; case_id не меняется, ровно два event_ids.
   Accepted Assignment A и current executor A сохраняются. Retry с прежним key/body не создаёт N+2.
4. Switch Contractor → A всё ещё имеет LIVE-доступ. Новый материал/SubmitResult с текущим N+1
   выполняется **без нового AcceptAssignment**. Сохранить новый result_id; прежний Result виден в истории.
5. Resident: `POST .../commands/resident-confirmation`, `{result_id,iteration_id}` → 200,
   feedback создан, Case ещё `AWAITING_RESULT_CHECK`, завершения от Resident нет.
6. УК: `POST .../commands/complete`,
   `{"result_id":"<current>","basis":{"type":"RESIDENT_CONFIRMATION","feedback_id":"<current>"}}`
   → 200, `COMPLETED`. В snapshot одна история, старые Result/remarks и N/N+1 сохранены.

## 6. Повторение и важные отрицательные ветки

- Новый DemoRun создаёт **новый Case**, не сбрасывает старый. Повторить основной путь до COMPLETED.
  Старые Case/history не появляются в списке нового run; попытка access через новый token → hidden 404.
- На отдельном новом run Contractor отклоняет Assignment через `reject-assignment` с current ID и
  synthetic reason. УК выбирает B, отправляет новое Assignment; B принимает и продолжает тот же Case.
  Reason не утечёт Resident. Selected-only B ещё не executor.
- В rework ветке A→B: A сохраняет LIVE-доступ до commit `select-contractor(B)`; после него
  current assignment/executor очищены, A теряет LIVE-доступ, B selected-only ещё не получает его.
  После отправки/принятия B работает в том же N+1; историческое accepted Assignment A не переписано.
- Старый `selection_id` / `assignment_id` / `result_id` с новым intent key → 409 соответствующего
  STALE_* на видимом ресурсе. Старый target не переносится на новый автоматически.
- Запрос без token → 401. Чужой Case/attachment/run → 404 до раскрытия state/terminal/stale.
  UK Employee на admin config → 403. Completed process mutation → 409 TERMINAL_CASE.
- Exact retry одной успешной command → canonical response, без второго event/Result/iteration.
  Повтор key с другим body/file bytes → 409 IDEMPOTENCY_KEY_REUSE.
- AddComment не заменяет формальное feedback. В REMARKS_REVIEW Resident без current clarification
  target → 409 CLARIFICATION_CONTEXT_REQUIRED. Запрос уточнения не создаёт отдельную ленту.
- PHOTO/FILE без обязательного материала на SubmitResult → 422 RESULT_MATERIAL_REQUIRED.
- В отдельном run проверить `record-no-resident-feedback`: отсутствие ответа не закрывает Case.
  `complete` с NO_RESIDENT_FEEDBACK требует event_id и отдельное
  `completion_basis={confirmed:true,process_reference:"[SYNTHETIC] ..."}`.
  Без этого basis завершение отвергается. Спорное завершение — отдельная `complete-with-explanation`
  команда УК с exact result/feedback и непустым explanation.
- `GET /api/v1/cases/{caseId}`: `case.activity[]` имеет `activity_id=event_id`, уникальные event_id,
  строго возрастающий event_seq; Comment/Result/Feedback дополняют существующий event, не дублируют факт.

Transport negatives 400/422 и actual attachment representation окончательно сверяются с TG-015–017
при final sync; draft не выдаёт предположение за фактически полученный response.

## 7. Persistence и cross-client continuity

1. Команда фиксирует без PII: case_id, state, revision, число activity, result/attachment IDs и checksum файла.
2. `docker compose restart app`; после readiness в прежнем run snapshot и download не изменились.
3. `docker compose down`, затем `docker compose up --build`; named DB volume сохранён.
4. Fresh signed bootstrap того же эксперта в другом MAX клиенте возвращает same ACTIVE DemoRun и
   primary Case. Может требоваться новый role switch; новый DemoRun не создавать для этой проверки.
5. Проверить те же Case/history/attachment bytes, readiness и build_sha.

## 8. Evidence для сдачи

Заполнить SHA/URLs/checklist, приложить обезличенные web/mobile результаты, timestamps, command exit codes,
Docker build duration и параметры машины/cache. Записать real vs fake отдельно. Не прикладывать tokens,
подписи initData, chat IDs, DB URLs и реальные personal data. Оставить решение online для экспертов.
