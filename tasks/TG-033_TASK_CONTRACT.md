# TG-033 — Runtime MAX mobile/web verification и evidence

## 1. Идентичность и база

- `TASK_ID`: TG-033; `RISK_CLASS`: DELIVERY / RUNTIME VERIFICATION; тип: MAX; execution class: Runtime Verification/Evidence.
- `CONTRACT_BASE_SHA`: `03395807603e205bf321437a559adc70b94ed504` (`main` на момент авторинга); ветка контракта: `codex/tg-033-contract`.
- База **исполнения** TG-033 определяется только после TG-032: fixed deployed candidate и его immutable `build_sha`. SHA контракта не подтверждает готовность deployment и не разрешает runtime verification заранее.

## 2. Цель и результат

Доказать наблюдениями в реальном MAX, что один зафиксированный deployed candidate выполняет обязательный Bot → Mini App → Result → proactive MAX message и полный mobile/web сценарий. Результат исполнения — датированный комплект evidence и честный статус каждого пункта; этот контракт сам по себе не является live evidence.

## 3. Необходимый контекст

- `tasks/TASK_GRAPH.md`, TG-032–TG-034 и раздел 10; `docs/03_ARCHITECTURE.md` §§26.8, 27.1–27.2, 31.2; `docs/05_INTERFACE_CONTRACTS.md` §§27–28, 36–37.
- `docs/02_PRODUCT_SPEC.md` AC-008/009, INV-046; `docs/07_DECISIONS.md` ADR-026.
- Результаты TG-032: public HTTPS app/API, bot/Mini App access, webhook subscription, deployed candidate SHA, persistent runtime и готовый judging account.

## 4. Зависимости и порядок

- `Depends On`: TG-032. `Unlocks`: TG-034. `Parallel With`: NONE.
- Перед первым live-прогоном сверить deployment `/api/v1/system/info.build_sha` с зафиксированным candidate SHA TG-032 и записать URL/context. Несовпадение блокирует evidence для этого candidate.
- При исправлении дефекта владельцем и новом build SHA начать новый комплект evidence; старые наблюдения не переносить автоматически на новый build.

## 5. Разрешённый объём и файлы

- При **исполнении** TG-033 разрешено создавать только `docs/evidence/max-live/**`: чеклист, обезличенные снимки/записи, диагностические выдержки и ссылки на проверяемые артефакты. При **авторинге этого контракта** разрешён только `tasks/TG-033_TASK_CONTRACT.md`.
- Проверять реальный Bot, Mini App, подпись initData, webhook, proactive delivery, полные mobile/web маршруты, восстановление DemoRun, загрузки, picker, retry/redrive и subscription recovery.
- Для каждого evidence set записать candidate build SHA, deployment URL/context, MAX client/platform и версию при наличии, дату/время с часовым поясом, метку test account identity без секретов, наблюдаемый Case/DemoRun ID в безопасной форме, шаги, ожидаемый и фактический результат, ссылки на артефакты и статус `PENDING | PASS | FAIL | BLOCKED`.

## 6. Исключения и запреты

- Никакого product implementation, production feature fix, изменения Freeze/Spec/Architecture, смены semantics или canonicalization `main` в TG-033. Дефект возвращается owning task и новому SHA; patch внутри TG-033 запрещён.
- Fake MAX adapter не является live evidence. Browser viewport не является MAX-mobile evidence. Прямой browser URL не эквивалентен открытию через MAX. Скриншот toast не заменяет доставленное сообщение MAX.
- Не отмечать `PASS` по предположению, автоматизированному browser test, исходникам или чужому клиенту: нужен фактический live-прогон именно указанной поверхности и candidate.

## 7. V-01…V-04 — обязательные platform observations

Каждый пункт начинается как `PENDING`; `PASS` возможен только после записи наблюдения для указанных клиентов. Наблюдательное различие V-01/V-02 само по себе не меняет MUST-flow.

- [ ] **V-01 — `open_app` / contextual payload parity:** открыть Bot → Mini App в web MAX и используемом mobile MAX, записать наличие/отсутствие payload/launch context отдельно; обязательный путь не зависит от optional context.
- [ ] **V-02 — Mini App `user.id` vs Bot API `user_id`:** сравнить только обезличенные значения/факт равенства на live account; delivery binding должен опираться на validated `chat.id/chat.type`, не на равенство namespace или `startapp` correlation.
- [ ] **V-03 — proactive Bot message lifecycle:** наблюдать реальный `POST /messages` и доставку после обычного Bot/dialog состояния, после возврата в Mini App и после паузы; подтверждать адресацию validated delivery target. Недоставка обязательного уведомления — blocker.
- [ ] **V-04 — web/mobile launch/download parity:** отдельно пройти Bot → Mini App → auth → тот же current DemoRun/primary Case → команды в web MAX и mobile MAX; проверить соответствующие web/native download пути.

## 8. Architecture §27.2 — дополнительный live checklist

Все пункты из Architecture §27.2 начинают как `PENDING`; для `PASS` нужны дата, платформа, build SHA, конкретное наблюдение и артефакт.

- [ ] Public Mini App URL открывается по HTTPS.
- [ ] MAX доставляет webhook; exact `X-Max-Bot-Api-Secret` принимается, неверный отклоняется, успешный ответ `200` приходит не позднее 30 секунд.
- [ ] После simulated loss/auto-unsubscribe subscription reconciliation восстанавливает ожидаемую webhook subscription.
- [ ] MAX принимает полную certificate chain на 443; hostname соответствует сертификату.
- [ ] Backend имеет TLS trust и outbound доступ к актуальному MAX Bot API.
- [ ] Подлинный raw MAX initData при реальном запуске проходит серверную HMAC/freshness проверку.
- [ ] Invalid/tampered и expired initData отклоняются.
- [ ] Прямой browser URL вне MAX не получает trusted MAX session.
- [ ] Native/mobile attachment download использует short-lived scoped capability и `window.WebApp.downloadFile`.
- [ ] Web MAX attachment download работает через поддерживаемый browser path.
- [ ] Photo picker и file picker достаточны для MUST отдельно в mobile MAX и web MAX.
- [ ] Валидный Result вызывает реальное MAX уведомление по validated delivery `chat_id`.
- [ ] Notification retry/redrive не создаёт второй Result.
- [ ] После `PERMANENT_FAILURE` redrive **того же intent** после исправления config доставляет сообщение без нового Result/EVT-008.
- [ ] Reload и fresh bootstrap второго MAX client восстанавливают тот же current DemoRun/primary Case.
- [ ] Frontend показывает ровно четыре role views; Contractor A/B выбирается server-side.
- [ ] Organizer Bot token и Mini App URL остаются активными для judging account; сам token в evidence не попадает.

## 9. Сквозной сценарий и идемпотентность

- В **каждом** реальном MAX client пройти обязательные действия до итогового решения УК по AC-009 без desktop-only шага; зафиксировать Bot → Mini App по AC-008, auth, один current DemoRun/primary Case, Result и сообщение жителю «Подрядчик сообщил о выполнении. Проверьте результат».
- На втором client выполнить fresh bootstrap и наблюдать продолжение **того же** ACTIVE DemoRun/primary Case, а не создание нового. Сверить безопасные идентификаторы и историю.
- Для temporary retry и `PERMANENT_FAILURE` → config correction → redrive снять до/после evidence по Result, EVT-008 и NotificationIntent. Критерий: один Result, один EVT-008, один notification intent; повторяется доставка того же intent, не бизнес-действие. Зафиксировать исход и факт сообщения в MAX.
- При повторе любого шага не использовать сброс БД, ручную подмену истории или fake transport как доказательство.

## 10. Evidence и защита секретов

- Хранить только минимальные обезличенные артефакты в `docs/evidence/max-live/**` с понятной привязкой к пунктам §7–9. Для каждого пункта фиксировать `PASS` только после фактического наблюдения; при отсутствии доступа/условий — `BLOCKED`, при отрицательном наблюдении — `FAIL` с шагом воспроизведения.
- Запрещены скриншоты Bot Token, webhook secret, session token, секреты окружения и raw initData, если оно содержит чувствительные данные. Маскировать заголовки, query, ID и персональные данные там, где требуется; хранить лишь результат проверки подписи и безопасные метки. Перед commit выполнить review артефактов на секреты.
- Доказательство доставки включает идентифицируемое в обезличенной форме входящее MAX сообщение и сопоставление с тем же Result/intent; один лишь backend log недостаточен.

## 11. Приёмка, проверки и self-check

- Приёмка **исполнения**: все обязательные live-пункты §§7–9 наблюдены и документированы на одном fixed deployed candidate; V-01/V-02 описаны как observations, а V-03/V-04 и обязательные пути имеют `PASS`; нет незакрытого `INTEGRATION BLOCKER`. TG-034 получает точные build SHA, URL/context и ограничения из evidence.
- Проверки **перед исполнением**: `git status --short --branch`, `git rev-parse HEAD`, deployed `/api/v1/system/info.build_sha`, TG-032 deployment evidence. Проверки **после исполнения**: полнота чеклиста, cross-client trace, Result/EVT-008/intent before/after, secret review, `git diff --check`, `git status --short`, diff только под `docs/evidence/max-live/**`.
- Self-check **авторинга**: ровно 12 Lean sections, `CONTRACT_BASE_SHA` равен базе до ветки, ссылки на все V-01…V-04 и каждый пункт Architecture §27.1/27.2, граф `TG-032 → TG-033 → TG-034`, запреты fake/viewport/direct URL, no secret evidence, no implementation, file diff только `tasks/TG-033_TASK_CONTRACT.md`.

## 12. Эскалация и передача

- Mandatory live path failure (webhook/auth/notification/mobile/web/download), несовпадение build SHA, недоступность judging account или отсутствие обязательного наблюдения: `INTEGRATION BLOCKER`; записать `FAIL/BLOCKED`, точный шаг и артефакт, вернуть owning task. TG-033 не патчит продукт и не подменяет evidence.
- Изменение продуктового правила, MUST, инварианта, роли, состояния или критериев приёмки: **STOP — `SPEC CONFLICT`**; решение команды и запись в `docs/07_DECISIONS.md` обязательны до продолжения.
- Deliverable исполнения: датированный комплект в `docs/evidence/max-live/**`, итоговый checklist и запросы к владельцам при blocker. Commit/push выполняются на task branch с существующей человеческой Git identity; вернуть полный commit SHA и статус remote. Авторинг этого контракта не разблокирует implementation до TG-032.
