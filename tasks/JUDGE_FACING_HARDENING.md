# Judge-facing hardening

## Контракт

- `TASK_ID`: JUDGE-FACING-HARDENING; `RISK_CLASS`: STANDARD (UI/read presentation, аудит существующих security/domain границ без их изменения).
- `BASE_SHA`: `5045dd220b85bbd89038821aac110ec46c44a9d3`.
- Ветка: `codex/judge-facing-hardening`; ответственный за shared files — текущий owner.
- Цель: исправить перечисленные UX/historical-display ошибки и подтверждённые аналогичные ошибки, получить проверяемый кандидат для повторного deploy.
- Источники: запрос команды; Product Freeze; Product Spec §§2, 3.11–3.15, 5–6, 8–10; Interface Contracts §§7–9, 12–16, 21–26; утверждённая ролевая видимость.
- Dependencies: текущий composed MVP на BASE_SHA; новые graph edges/task IDs не вводятся.
- Разрешены: `apps/web/src/**`, `apps/web/vite.config.ts` (ограничение параллелизма тестов для локального Windows), presentation/read-only projection в `apps/api/src/modules/read-models/**`, соответствующие `apps/api/tests/**`, `scripts/demo/**`, этот контракт. Новые зависимости не нужны.
- Запрещены: изменение четырёх ролей, восьми состояний, command semantics, immutable истории/Result links, схемы DB, auth/security policy, scope Freeze/Spec, автозавершение, второй primary Case в DemoRun, публикация/deploy.
- Материалы до upload можно убрать локально; после upload исключение касается только draft Result; после SubmitResult доступно только чтение/скачивание. Один CaseEvent — одна карточка; Result и его файлы показываются вместе, автор берётся из исторического события.
- A сохраняется после ReturnToRework; optional замена оформляется отдельными Select/Send/Accept. Не предлагать повторный выбор текущего Selection; не давать дополнительные права.
- Presentation: единые названия этапов, роли и технические enums на русском, время Europe/Moscow, компактный номер обращения, явное раскрытие демоданных, ясная ответственность/следующий шаг.
- Приёмка: regression tests исторических/card/material/navigation исправлений; typecheck/build/web/contracts/relevant real-PG/root suite; Playwright desktop/mobile по happy, same-A, A→B, rejection→B, clarification, files/downloads, config→new Case, repeat и terminal.
- Завершение: проверки, commit/push с существующей Git identity, FINAL_SHA и сверка remote. SPEC CONFLICT о раскрытии B истории A решается только командой; затронутое расширение видимости не реализуется до решения.

## План выполнения

- [x] Regression tests: исключить дублирование текста, проверить карточку Result+материалы+исторический автор, Moscow/stage/reference presentation.
- [x] Один общий renderer истории и read-only files с существующим capability download; подключить к четырём ролевым представлениям без изменения доступа.
- [x] Draft materials: remove local file, inclusion actions вместо checkbox, восстановление уже загруженных материалов из разрешённой истории; скрыть controls сразу после успешного SubmitResult.
- [x] Rework/UK: optional replacement, исключение текущего выбора из candidates, explicit selected/sent/accepted, confirmation→отдельное завершение УК.
- [x] Демо/navigation/admin: четыре роли, понятные подписи, primary-only только в demo, новый DemoRun, локализация настроек.
- [x] Real-PG audit: неизменность A Result/material/event actor после B, A lost authority, same-A без повторного принятия, один event→один item.
- [x] Playwright: воспроизведение, оба viewport, все сценарии и high-confidence исправления.
- Финальные проверки и diff review фиксируются ниже; commit/push и remote SHA — в итоговом ответе.

## Результат реализации

Исправлены presentation и навигация без изменения API/domain/security policy, DB schema и нормативных документов. Общая карточка события использует исторического автора из read model; Result показывает только свои immutable links. Отдельный upload остаётся самостоятельным событием. Выбор, отправка и принятие подрядчика сохраняют отдельные команды. Подтверждение жителя сохраняет ожидание проверки до явного завершения УК.

При обходе дополнительно найдены и исправлены три high-impact UX ошибки: потеря загруженных материалов в черновике после повторного открытия карточки, сохранение старой карточки после нового DemoRun, сохранение недоступного экрана настроек после смены роли. Тесты устойчивости session/idempotency сохранены: новый прогон уводит со старого маршрута, после открытия карточки команда получает ключ нового контекста.

## Проверки

- `npm run typecheck` и `npm run build` — PASS. Новых зависимостей нет; web JS около 545,55 КБ / 161,05 КБ gzip. Существующее предупреждение Vite о chunk >500 КБ сохраняется.
- Focused real-PG audit и execution/read/feedback suites — 49 тестов PASS; дополнительно проверены неизменность Result A, его links, назначения, материалов и события после Result B, отсутствие LIVE authority A сразу после Select B, same-A без reaccept, сохранение исключённого из Result upload.
- Playwright desktop `1440×900` и mobile `390×844` — PASS: по 32 сочетания роли/состояния; happy, same-A, A→B, rejection A→B, clarification, local remove/draft inclusion, committed read-only, download, admin config→новый Case, repeat DemoRun, terminal. Нет JS errors, горизонтального переполнения, duplicate event cards и технических labels в проверенных представлениях.
- `npm run test:owned-db` — PASS: 80 файлов / 1042 теста (contracts 99, domain 141, DB 53, API 446, web 303). Временные DB созданы и очищены через ownership-checked harness. После исправления устаревших ожиданий тестов повторена root suite; итоговый exit code 0.
- Self-check diff: разрешённые файлы, отсутствие изменений бизнес-логики/прав, staged `git diff --check` — PASS. Локальный synthetic-auth preview остановлен после smoke; deploy не выполнялся.

## Единственный открытый SPEC CONFLICT

Пункт 7 запроса требует показать Contractor B оба Result и файлы старого назначения A. Product Spec §6.3 описывает актуальное назначение, этап и результат как разрешённый контекст подрядчика; действующие read model и attachment policy скрывают результат и файлы A от B. Расширение видимости затрагивает security/product правило и не выполнено без решения команды. Запрошено уточнение; решение пока не получено, Freeze/Spec/журнал решений не изменены.

Житель, сотрудник УК и администратор УК видят оба результата с правильными авторами A/B, этапами и файлами. B видит собственный результат и файлы; попытка доступа к файлу A возвращает 404. Эти границы подтверждены real-PG тестом. Для полного judge-facing PASS требуется решение команды о пункте 7; текущий результат — BLOCKED только по этому требованию.
