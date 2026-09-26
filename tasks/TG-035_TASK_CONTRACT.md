# TG-035 — Final regression, artifact freeze и submission handoff

## 1. Identity / BASE_SHA

`TASK_ID = TG-035`; `RISK_CLASS = DELIVERY / FINAL GATE`; владелец — LANE-A. `CONTRACT_BASE_SHA = 6a2b1c3d1c1eedd79ac20d16cc4b76af30a21fc8` (фактический `origin/main` для authoring). Это **не** SHA будущего release candidate. Implementation запрещена до завершения TG-034; при её старте зафиксировать новый стабильный `BASE_SHA` и сверить с `git rev-parse HEAD`.

## 2. Goal

Проверить один immutable candidate, собрать полный final regression record, затем зафиксировать source/artifact/deployment/evidence identities и передать результат команде для отдельного человеческого решения о подаче. `TECHNICAL_RELEASE_READY = YES` возможен только после всех обязательных PASS; TG-035 не подаёт заявку и не утверждает её самостоятельно.

## 3. Canonical sources

Иерархия: официальные требования и уточнения → `docs/01_PRODUCT_FREEZE.md` → `docs/02_PRODUCT_SPEC.md` → `docs/03_ARCHITECTURE.md` → `docs/04_DATA_MODEL.md` → `docs/05_INTERFACE_CONTRACTS.md` → код. Для gate применяются `docs/09_HACKATHON_CRITERIA.md` §§3–10, Architecture §§21, 24, 26–27, Interface Contracts §37A, `docs/07_DECISIONS.md` и `tasks/TASK_GRAPH.md` §3/TG-035. Контекст и текущее состояние: `docs/00_PROJECT_BRIEF.md`, `docs/08_PROJECT_STATE.md`; формат — `tasks/TASK_TEMPLATE.md`.

## 4. Dependencies / unlocks

`Depends On: TG-034`; `Unlocks: NONE`. До TG-034 допускается только authoring этого контракта. После успешного TG-035 candidate технически готов к **отдельному** human submission decision. Наличие TG-032 deployment и TG-033 real MAX evidence проверяется как часть цепочки TG-034 → TG-035; чужие незавершённые задачи не объявляются выполненными.

## 5. Allowed write scope

Сейчас: только `tasks/TG-035_TASK_CONTRACT.md` в `codex/tg-035-contract`. При будущей implementation: только final verification manifest, checksums и evidence по scope TG-035 в Task Graph; точные пути согласовать с Integration Agent от стабильного checkpoint. Shared manifests, source и материалы TG-034 принадлежат их владельцам.

## 6. Forbidden scope

В TG-035 запрещены feature fixes, правки production code, миграций, Product Freeze/Spec/Architecture, README, presentation и deployment config, подмена real MAX fake adapter, смешение evidence разных builds, публикация секретов, push в `main`, self-approval implementation/submission. Gate не становится repair branch: любой дефект возвращается владельцу и возобновляется на новом candidate.

## 7. Required behavior / invariants

Final regression явно доказывает Product Spec §§3–5, 11, 14–17, 20–23 и AC-001–010: ровно 8 states и 4 roles; один неизменный Case ID и история; `selected ≠ sent ≠ accepted`; исполнительские права только у принятого текущего Assignment, у прежнего подрядчика нет LIVE-доступа; одна наблюдаемая лента комментариев без скрытого Resident↔Contractor чата; прежние Result/history immutable. Result подрядчика и подтверждение жителя не закрывают Case; завершает только УК; `COMPLETED` terminal; нет auto-close и вывода feedback по таймеру.

Обязательные E2E: (1) Resident → УК → Contractor → Result → подтверждение Resident → завершение УК; (2) Result → замечание → решение УК → `ReturnToRework` → N+1 → новый Result → подтверждение → завершение; (3) доработка A→B создаёт N+1 ровно один раз, отзывает LIVE-права A, B проходит selected/sent/accepted, остаётся N+1 без случайного N+2; (4) первичный отказ A → назначение B в том же Case/iteration; (5) повторный DemoRun создаёт новый Case, сохраняя предыдущий Case/history.

## 8. Dependency requests

`NONE` для authoring. Будущая проверка использует утверждённые project tooling и артефакты TG-026–034; если инструмент или shared manifest требует изменения, запросить владельца и Integration Agent, не править shared files в TG-035.

## 9. Acceptance criteria

До запуска gate зафиксированы exact Git commit SHA, checksum source archive, built image/artifact digest, deployment identity/URL, публичный `GET /api/v1/system/info.build_sha` и identity evidence bundle. Все идентификаторы относятся к одному candidate; `build_sha` точно равен frozen SHA. Public HTTPS имеет доверенный сертификат и полную цепочку без обхода TLS verification. Каждый обязательный пункт §10 имеет проверяемую ссылку, timestamp, среду и PASS; `NOT_RUN`, недоступный scan и неподтверждённое утверждение не равны PASS.

На чистом candidate измерена Docker build duration ≤5 минут: start/end одной сборки и версия команды/среды записаны; исключено **только** время первоначальной загрузки базовых образов согласно `docs/09_HACKATHON_CRITERIA.md` §8. Нет выдуманных performance claims.

Final secret review охватывает repository, source archive, image/config artifacts, screenshots и logs: нет MAX Bot Token, webhook/session secrets, DB password, raw sensitive initData или рабочих credentials. Зафиксированы dependency inventory, license inventory и dependency/security scan утверждёнными project tools с честной регистрацией findings. Неприменимость или недоступность инструмента требует blocker/явного решения владельца gate, не фиктивного PASS.

README, runbook, presentation source/PDF, submission files, public URLs, repository SHA и screenshots TG-034 сверены с exact candidate и фактическими возможностями; устаревшие изображения и неподтверждённые заявления блокируют gate. После всех PASS freeze фиксирует Git SHA, checksums, image/deployment identities, evidence references, submission artifact identities и timestamp. **Любое** изменение source/config artifact после freeze отменяет identity: новый Git SHA, где применимо, новый build/deployment identity/checksum, affected regression rerun и обновлённый evidence; «малой правки» под прежним SHA нет.

## 10. Required tests

Final record содержит зелёные результаты всей матрицы, с фактическими командами/методом проверки и ссылками на evidence:

| № | Обязательная граница |
| --- | --- |
| 1–5 | domain/state machine; DB migrations/constraints; real PostgreSQL; concurrency; idempotency |
| 6–10 | authorization/tenant isolation; API contracts против deployable registry; role-filtered reads; attachments; configuration |
| 11–15 | MAX adapter; notification/outbox; browser E2E; responsive mobile/web browser; Docker/compose |
| 16–20 | restart/persistence; OpenAPI; DATA-API; public deployment; HTTPS/TLS |
| 21–23 | real MAX mobile; real MAX web/Desktop; real proactive MAX notification |

Для каждого пункта записать фактическую команду или метод, exit code и результат. Если root `npm run test:integration` либо `npm run test:e2e` выводит `NO_SUITE_YET`, считать suite `NOT_RUN` даже при exit code 0; заменить заглушку реальным evidence владельца соответствующей задачи.

Clean reproducibility rehearsal из fresh checkout/source candidate: clean install → build → Docker image build → compose startup → PostgreSQL initialization → migrations → deterministic seed → application и worker startup → automated regression и обязательные E2E §7 → restart → persistence confirmation → public deployed smoke. Developer-local leftovers недопустимы. Проверить доступность MAX и API на период оценки.

Real TG-033 evidence обязателен: bot → Mini App, valid real initData и rejection tampered/invalid initData, proactive notification, оба реальных MAX клиента, cross-client continuity того же Case, attachment/native и web download paths, subscription recovery, retry/redrive dedupe. Evidence указывает client/account/candidate. Fake adapter и browser mobile viewport не заменяют real MAX mobile; каждый client проверяется отдельно.

## 11. Git / integration handoff

Authoring: branch `codex/tg-035-contract` от `CONTRACT_BASE_SHA`; self-check, commit и push только этой ветки с существующей человеческой Git identity, вернуть полный commit SHA. Будущая implementation начинается лишь после TG-034 на новом stable checkpoint; фиксирует candidate и выдаёт структурированный manifest: candidate SHA, artifact checksums, image/deployment identity и `build_sha`, full regression, real MAX, security, dependencies/licenses, docs consistency, freeze timestamp/identity, blockers. Integration Agent получает evidence и `TECHNICAL_RELEASE_READY = YES/NO`; решение о фактической подаче остаётся у людей.

## 12. Blocker protocol

При failed/`NOT_RUN` gate: `TECHNICAL_RELEASE_READY = NO`, freeze не выполнять, зафиксировать failure/evidence/owner. Feature defect → owning feature task; DB/concurrency → соответствующий DB/kernel owner; MAX → TG-019/TG-032/TG-033; Docker → TG-030; API → TG-027/feature owner; browser E2E → TG-028/feature owner; documentation → TG-034. После исправления нужен новый candidate SHA/identity и повтор affected regression. При `SPEC CONFLICT`, неверном `BASE_SHA`, выходе за write scope или несовместимости canonical contracts остановить затронутую работу и сообщить точный blocker ответственному; продуктовые правила TG-035 не меняет.
