# TG-029 — Early Product vertical slice integration checkpoint

## 1. Identity / BASE_SHA

`TASK_ID = TG-029`; `RISK_CLASS = CRITICAL`; `Primary Ownership = LANE-A`; `CONTRACT_BASE_SHA = 5493905ac2e9ed7bbc21527acd9d4dc0eddc9bc5` (actual `origin/main` при authoring). Это база **контракта**, не разрешение на implementation: её стабильный `BASE_SHA` назначается заново после завершения всех direct implementation dependencies и сверяется с `git rev-parse HEAD`.

## 2. Goal

Собрать первый исполняемый вертикальный продукт на одной карточке и истории: Житель → УК → Подрядчик → Результат → Житель → УК. Итог — единые deployable API/web registries и воспроизводимый integration smoke через настоящие модули и PostgreSQL, включая доработку и повторный DemoRun.

## 3. Canonical sources

Приоритет из `AGENTS.md`: `docs/01_PRODUCT_FREEZE.md` (MUST, роли, границы); `docs/02_PRODUCT_SPEC.md` (основной сценарий, итерации, доступ, DemoRun, AC-001/002/003/006/008/076); `docs/03_ARCHITECTURE.md` §§5–9, 18, 26; `docs/04_DATA_MODEL.md` (Case/Iteration/Result/history/outbox); `docs/05_INTERFACE_CONTRACTS.md` (session, команды, reads, attachments, config, MAX, diagnostics); `tasks/TASK_GRAPH.md` §TG-029; `tasks/TASK_TEMPLATE.md`; `docs/08_PROJECT_STATE.md`. Готовые frontend seams: TG-021 `2168cad019420880055b8dca93147ff2146633cc`, TG-022 `bdb65737f5d2898537700edea35743f6c95f2355`, TG-023 `999c12befbe3bcf986a314c2a66bac38ea0a7c8a`, TG-024 `30579e4e3bd35f4e7ae1be9c44000f067105b234`, TG-025 `6b031dd6413712d4e79368e938c6c4b80d587bab`. Backend contract references: TG-013 `e797423dd0cf20e8ad04e2089d841c335142a477`, TG-017 `11e5612caf05dbbca27ed224359becdf7b596029`, TG-018 `1dc606b4e510c469a26bb6859c9de949904d0b22`, TG-019 `a2b89b96d8b33d799483953a71ca0f2f305c4087`. Эти SHA не доказывают готовность соответствующей implementation.

## 4. Dependencies / unlocks

Canonical direct `Depends On = TG-013, TG-017, TG-018, TG-019, TG-022, TG-023, TG-024, TG-025`; `Unlocks = TG-027, TG-030, TG-031`; `Parallel With = TG-026`. Contract authoring разрешён сейчас; implementation строго заблокирована, пока **все восемь** direct implementation dependencies не завершены и не доступны на назначенной стабильной базе. TG-026 не объявляется скрытой direct dependency.

## 5. Allowed write scope

Сейчас — **только** `tasks/TG-029_TASK_CONTRACT.md`. Для будущей implementation TG-029 владеет исключительно механической композицией: canonical API registry `apps/api/src/app/app.ts` или его утверждённым successor; canonical web registry `apps/web/src/app/router.tsx`, `apps/web/src/app/routes.tsx` или их утверждённым successor; integration smoke/composition tests и scripts в выделенном TG-029 scope; минимальный wiring только с явно подтверждённым владельцем shared file. Изменения registries сериализуются одним TG-029 owner.

## 6. Forbidden scope

Feature internals TG-013/017/018/019/021–025, domain rules, authorization, schemas, migrations, root manifests, Product Freeze/Spec, Architecture, Task Graph и будущие delivery files — read-only. Не копировать feature code, не создавать replacement modules, test-only backend registry, in-memory workflow или direct DB transitions. Не исправлять feature semantics ради smoke, не выдавать fake MAX за live evidence, не canonicalize `main` в стадии authoring.

## 7. Required behavior / invariants

- Один `Case.id` и append-only history проходят authenticated/demo bootstrap, новый `DemoRun`, Resident `CreateCase`, UK `AcceptCase` → `SelectContractor` → `SendAssignment`, Contractor `AcceptAssignment` → work/execution → `SubmitResult`, `NotificationIntent`/outbox worker, Resident confirmation, UK completion и финальный `COMPLETED`. Selected, sent и accepted остаются разными шагами; backend `allowed_actions` и TG-012 command kernel задают authority.
- Remark branch: новый Result → замечание Жителя → review УК → `ReturnToRework` создаёт `N+1` **ровно один раз** → повторная работа и новый Result → подтверждение Жителя → завершение УК. Старые Result и history неизменны, Case ID постоянен.
- Rework A→B: после `ReturnToRework` подрядчик A теряет LIVE authority; УК выбирает и отправляет Assignment B, B принимает; iteration остаётся `N+1`, переназначение не создаёт `N+2`. Initial rejection A возвращает управление УК: альтернативный подрядчик, отправка, принятие и продолжение на том же Case/history.
- Обязательный сценарий исполняется дважды через **новый** DemoRun: второй создаёт новый Case; первый Case/history остаются без reset/rewrite. Session, authorization, role-filtered reads, attachment/download capability, config snapshot и неизменяемые факты проходят реальные модули.
- API registry подключает existing auth/session, demo, lifecycle commands, role-filtered reads, attachments/downloads, configuration API, MAX adapter/webhook, notification worker boundaries и diagnostics/readiness. Web registry подключает session/demo shell, Resident, UK, Contractor и UK Admin configuration из feature contributions; маршруты доступны в mobile и web.
- Автоматический smoke может выбирать fake MAX adapter **только** в явной test configuration; live/production выбирает real adapter через canonical typed config. Smoke проходит реальный PostgreSQL, session, authorization, TG-012 command kernel и actual domain/feature modules. `SubmitResult` создаёт один Result и один соответствующий intent; retry/dedupe уведомления не повторяет Result. Fake adapter не закрывает отдельную live MAX evidence gate.

## 8. Dependency requests

`NONE` на стадии contract authoring. Future implementation использует существующие модули и packages. Если понадобится новый package либо shared manifest/wiring вне §5, TG-029 передаёт точный запрос Integration Agent/владельцу и ждёт отдельного решения; конкурентные правки shared files запрещены.

## 9. Acceptance criteria

Единые final API/web registries реально запускают все поверхности §7, включая configuration backend и UK Admin UI. На одной Case/history наблюдаемы happy path до `COMPLETED`, remark/rework, A→B handoff без `N+2` и recovery после initial rejection. Повторный DemoRun создаёт новый Case без изменения первого. Notification intent/worker dedupe, реальные auth/authorization/PostgreSQL/TG-012 и mobile/web routes доказаны. Diff содержит только composition, не feature semantic patching; все failures feature contract маршрутизированы владельцам.

## 10. Required tests

На будущей implementation branch выполнить и показать результаты: `npm ci`, `npm run typecheck`, `npm run build`, `npm test`, actual full composition/integration suite against **real PostgreSQL**, `git diff --check <implementation-base>` и file-scope diff. `NO_SUITE_YET`/placeholder output не считается pass. Smoke обязан покрыть отдельно happy path, remark/rework, A→B authority handoff, initial rejection continuation, repeat DemoRun, old Case/history preservation, config API/UI, attachment/download and mobile/web routes, NotificationIntent delivery/retry dedupe, readiness и отсутствие bypass. Успех fake adapter фиксируется как automated test evidence, без claim о real MAX.

## 11. Git / integration handoff

Authoring: ветка `codex/tg-029-contract` от указанного `CONTRACT_BASE_SHA`; commit/push **только** файла контракта с существующей human Git identity, сверить local/remote SHA и clean worktree; затем одна независимая review. Сейчас не merge/push `main`. Для будущей implementation: Integration Agent назначает новый stable base только после всех восьми dependencies. Перед любой mutation `main` и повторно перед final push — fetch actual `origin/main`; no force push, no concurrent registry mutation. Полный implementation SHA, проверки и дефекты передаются Integration Agent; TG-029 сам не канонизирует `main`.

## 12. Blocker protocol

Неверный base, незавершённая direct implementation dependency, выход за write scope, feature contract failure или несовместимость утверждённых источников блокируют затронутую implementation. Сообщить owning task и точный failure; в TG-029 разрешён только mechanical composition fix. Если требуется изменить product rule, остановиться с `SPEC CONFLICT`: решение команды и запись в `docs/07_DECISIONS.md`, без обхода. Для `RISK_CLASS = CRITICAL` independent review с `FIX_REQUIRED` возвращает один полный batch findings, один batch fix и targeted closure.
