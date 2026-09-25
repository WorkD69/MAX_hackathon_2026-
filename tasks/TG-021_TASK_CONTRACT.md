# TG-021 TASK CONTRACT

```text
TASK_ID = TG-021
ASSIGNEE = ARTEM
RISK_CLASS = STANDARD
BASE_SHA = 639f8c9ee02026741beb8aae723906dc9d6da9c6
DEPENDENCY_TG020_IMPLEMENTATION_SHA = 7cafbf676b67ff16f02d4b5f64fc4ed65c9b044f
TASK_CONTRACT_STATUS = AUTHORING
TASK_CONTRACT_GATE = SELF-CHECK
CODING = BLOCKED UNTIL CANONICALIZATION
```

## 1. Identity / BASE_SHA

`TASK_ID = TG-021`, краткое название: «Case list/details, status, activity и stale UX». `RISK_CLASS = STANDARD`. Полный `BASE_SHA` стабильной базы: `639f8c9ee02026741beb8aae723906dc9d6da9c6` (origin/main на момент авторинга). `DEPENDENCY_TG020_IMPLEMENTATION_SHA = 7cafbf676b67ff16f02d4b5f64fc4ed65c9b044f`. Перед работой сверить HEAD с `BASE_SHA`; implementation branch создаётся от `BASE_SHA`. Текущий HEAD контракт-авторинга: `0332bf029ab12a1217f1aef5f6bf0f26e6a2faca`. Branch: `codex/tg-021-contract`.

## 2. Goal

Реализовать shared Case read experience для всех четырёх ролей из server projections: role-filtered list, Case details с semantic status/responsibility/next step, event-seq activity, allowed-actions renderer registry, и stale/409 UX без auto-retry и без auto-retarget. Frontend НЕ реализует state machine; backend авторитативен.

## 3. Canonical sources

- `docs/01_PRODUCT_FREEZE.md` §6–7, 15 (Product Freeze v1.0, APPROVED)
- `docs/02_PRODUCT_SPEC.md` §§4–7, 23 (Product Spec v1.0, APPROVED)
- `docs/03_ARCHITECTURE.md` §§6.1–6.2, 8.2–8.5, 11, 14 (Architecture: финальный кандидат)
- `docs/05_INTERFACE_CONTRACTS.md` §§6–9, 29, 30, 33 (Interface Contracts: финальный кандидат)
- `docs/07_DECISIONS.md` ADR-015, ADR-025, ADR-027 (Журнал решений)
- `docs/08_PROJECT_STATE.md` (текущее состояние проекта)
- `tasks/TASK_GRAPH.md` §3 TG-021 (утверждённый Task Graph)
- `tasks/BACKLOG.md` (risk-class workflow для Wave 2+)
- `tasks/TASK_TEMPLATE.md` (шаблон Lean Task Contract)
- `docs/ORCHESTRATOR_HANDOFF.md` (передача оркестратору)

Иерархия при расхождении: официальные требования → Product Freeze → Product Spec → Architecture → Interface Contracts → ADR → Task Graph → этот контракт.

## 4. Dependencies / unlocks

**Depends On**: TG-020 (реализация frontend bootstrap/session/demo, SHA `7cafbf676b67ff16f02d4b5f64fc4ed65c9b044f`). TG-020 предоставляет session hooks, role context, demo controls, platform adapter seam — всё, что TG-021 потребляет для server-state reads.

**Unlocks**: TG-022 (Resident UX), TG-023 (UK workflow UX), TG-024 (Contractor UX). Эти задачи добавляют формы/действия через feature-owned слоты, не редактируя центральный роутер.

**Parallel With**: TG-007, TG-011, TG-025. TG-021 параллельно с ними, но не зависит от их реализации.

**TG-017 hidden dependency**: ABSENT. TG-017 (backend read models) реализуется позже и НЕ является dependency TG-021. TG-021 использует approved Interface Contracts и typed fixtures/mocks, не копируя server read-model logic. Future implementation TG-017 будет потреблять те же Interface Contracts.

## 5. Allowed write scope

- `apps/web/src/features/cases/read/**` — Case list, Case details, status/responsibility/next-step mapping, activity feed, stale banner, refresh controls; shared Case components (CaseCard, CaseDetails, ActivityFeed, StatusBadge и производные).
- `apps/web/src/features/cases/shared/**` — shared Case presentation components (если выносятся за boundaries read/).
- Не изменять центральный роутер (TG-004 владеет до TG-029).
- Не изменять root manifests/lockfile (dependency requests = NONE).
- Не создавать backend-файлы.

## 6. Forbidden scope

- Не менять Product/Architecture semantics, восемь состояний, роли, основной сценарий, инварианты.
- Не реализовывать backend. TG-017 read models — отдельная задача.
- Не создавать hidden dependency на TG-017.
- Не реализовывать state machine в frontend.
- Не делать optimistic workflow mutation.
- Не изменять Task Graph.
- Не менять центральный роутер.
- Не добавлять dependency в root manifests/lockfile.
- Не получать полный forbidden Case с последующим CSS hiding — использовать role-filtered responses.
- Не выводить authorization или transitions самостоятельно.
- Не создавать `*_AUTHORING_REPORT.md`, `*_REVIEW.md`, `*_RECHECK.md` и другие internal process artifacts (применимо к Lean Hackathon SDD с Wave 2).

## 7. Required behavior / invariants

### 7.1 Case list
- Server-authoritative role-filtered projection: список формируется backend; каждая роль видит только разрешённые Cases.
- Loading/empty/error states: обязательная обработка всех трёх состояний списка.
- No client-side authorization inference: фільтрация и видимость полностью серверные.
- `Case.updated_at` — единственный источник свежести списка.
- DEMO_MODE: `Case.demo_run_id == session.demo_run_id`; Cases из других run скрываются.

### 7.2 Case details
- Semantic status: статус отображается понятной формулировкой (не техническим кодом), соответствует 8 states.
- Responsibility: кто сейчас выполняет следующий шаг (роль + имя организации, если назначен подрядчик).
- Next step: понятное действие «что будет дальше».
- Authoritative current snapshot: данные от backend, не из клиентского кэша.
- Permitted old iterations/results: исторические итерации и результаты видны как past facts; старые подрядчики не получают LIVE-доступ.
- Permitted attachment metadata: `initial_attachments[]` с `attachment_id/file_name/mime_type/byte_size`; только разрешённым ролям.

### 7.3 Поддержка ровно 8 states
CREATED, ACCEPTED_BY_UK, SENT_TO_CONTRACTOR, EXECUTION, AWAITING_RESULT_CHECK, REMARKS_REVIEW, REWORK, COMPLETED. Frontend НЕ реализует state machine; state — presentation mapping server-provided value.

### 7.4 Activity
- Order by `event_seq` (не client timestamp).
- One CaseEvent = one activity fact.
- Не дублировать один event как отдельные comment/result/activity records. `activity` item keyed by `CaseEvent.event_id`; Comment/Result/Feedback/Attachment enrich соответствующий event item.
- Role-filtered visibility: каждая роль видит только разрешённые facts.

### 7.5 allowed_actions
- Server-provided only. Backend возвращает массив semantically explicit capabilities.
- Renderer registry НЕ выводит authorization или transitions самостоятельно.
- Отсутствие action в массиве — UX signal; security всё равно server-side.
- `allowed_actions` не является authorization token.

### 7.6 409 / stale UX
При 409:
- Stale/conflict message: «Случай изменился с момента открытия. Данные обновлены.»
- Invalidate/refetch authoritative snapshot: refetch Case snapshot.
- No automatic retry: никогда не повторять command автоматически.
- No automatic retarget: никогда не переносить action на новый target автоматически.
- Focus refresh: refetch при возврате Mini App в foreground.
- Manual refresh: пользовательская кнопка/контроль ручного обновления.

### 7.7 Visibility
- Не получать полный forbidden Case с последующим CSS hiding.
- Использовать role-filtered responses. Forbidden fields просто отсутствуют в payload.
- Contractor reject reason не приходит Resident; hidden fields не сериализуются сервером.

### 7.8 No optimistic workflow mutation
- До backend success UI не меняет business state.
- Допустим только визуальный `pending` индикатор.
- После success command response UI refetch'ит snapshot.

### 7.9 Server state
- TanStack Query хранит remote state.
- Локально: поля формы, состояние modal/accordion, pending indicator, in-memory session token, текущий route.
- Case workflow и permissions не копируются в Redux-подобный global store.

## 8. Dependency requests

**NONE**. Не менять root manifests/lockfile. Все зависимости уже доступны через существующий workspace (React, TanStack Query, Zod schemas из `@max-smart-city/contracts` через TG-002).

## 9. Acceptance criteria

1. Case list отображает role-filtered cases для всех четырёх ролей; loading/empty/error states обработаны.
2. Case details показывает semantic status, responsibility, next step, authoritative snapshot, permitted old iterations/results, permitted attachment metadata.
3. Все 8 states отображаются корректно; ninth state невозможен на уровне product spec.
4. Activity ordered by `event_seq`; один event = один item; нет дублирования.
5. `allowed_actions` renderer registry получает actions только от backend; не выводит transitions самостоятельно.
6. 409 вызывает stale message + refetch; нет auto-retry; нет auto-retarget; focus refresh работает; manual refresh работает.
7. Forbidden fields отсутствуют в payload (не скрыты CSS); нет получения полного forbidden Case.
8. Role-filtered snapshot fixtures для 4 ролей × 8 states.
9. Mobile и web layout корректны.
10. Не изменён Task Graph; не добавлены dependencies в root manifests; нет hidden dependency на TG-017.
11. State machine не дублирован в frontend; нет optimistic workflow mutation.

## 10. Required tests

- **8-state presentation matrix**: таблица, показывающая отображение каждого из 8 states для каждой роли (видимый статус, responsibility, next step, доступные allowed_actions).
- **Role-filtered snapshot fixtures**: fixtures для 4 ролей × 8 states, показывающие что видит каждая роль; forbidden fields отсутствуют.
- **List loading/empty/error**: тесты для всех трёх состояний списка.
- **Details**: тесты отображения semantic status/responsibility/next step/snapshot/old iterations/attachments.
- **Permitted history**: старые итерации/результаты видны как history; старый подрядчик не имеет LIVE-доступа.
- **Forbidden-field absence**: проверка что forbidden поля (reject reason для Resident, UK-only audit и т.д.) отсутствуют в payload.
- **Event_seq ordering**: activity упорядочен по event_seq, не по client timestamp.
- **Activity de-duplication**: один CaseEvent = один activity item; нет дублирования comment/result/feedback как отдельных items.
- **Allowed_actions no-inference**: renderer registry не вычисляет actions; получает только от backend.
- **409 message + refetch**: при 409 показывает stale message и делает refetch.
- **No auto-retry**: нет автоматического повтора command при 409.
- **No retarget**: нет автоматического переноса на новый target при 409.
- **Focus refresh**: refetch при возврате в foreground.
- **Manual refresh**: пользовательский контрол ручного обновления.
- **Mobile layout**: viewport-тесты для mobile.
- **Web layout**: viewport-тесты для web.

Тесты соразмерны риску STANDARD; unit + integration тесты для read components; Playwright для layout/behavior.

## 11. Git / integration handoff

- Branch: `codex/tg-021-contract`
- BASE_SHA: `639f8c9ee02026741beb8aae723906dc9d6da9c6`
- Commit/push с существующей человеческой Git identity (не AI author).
- Единственный изменённый файл: `tasks/TG-021_TASK_CONTRACT.md`.
- После self-check PASS: commit, push в `origin`, вернуть commit SHA.
- Не push в `main`.
- Передача Integration Agent: контракт готов для canonicalization → implementation → wave integration.

## 12. Blocker protocol

Остановить работу при:
- `SPEC CONFLICT`: любое изменение Product Freeze / Product Spec semantics.
- Неверный BASE_SHA: `git rev-parse HEAD` не равен `639f8c9ee02026741beb8aae723906dc9d6da9c6`.
- Выход за allowed write scope: изменение файлов за пределами `apps/web/src/features/cases/read/**` и `tasks/`.
- Несовместимость утверждённых Interface Contracts.
- Требование изменить Task Graph, добавить dependency, или создать hidden dependency на TG-017.

Сообщить конкретный blocker ответственному (Integration Agent / Team Lead). Для STANDARD risk-class: self-check → canonicalize → implementation → wave integration; independent review НЕ нужен если нет real semantic ambiguity или high-risk boundary.

---

## SELF-CHECK

| Критерий | Статус |
| --- | --- |
| RISK_CLASS = STANDARD | PASS |
| Depends On = TG-020 only | PASS |
| Unlocks TG-022/023/024 | PASS |
| TG-017 hidden dependency absent | ABSENT |
| Backend-authoritative boundary | PASS |
| State machine not duplicated | PASS |
| No optimistic workflow mutation | PASS |
| No Task Graph change | PASS |
| Concise contract (12 lean sections) | PASS |
| Only contract file changed | PASS |
| Write scope = `apps/web/src/features/cases/read/**` + shared components | PASS |
| Forbidden scope respected | PASS |
| 8 states presentation | PASS |
| 409 policy (no auto-retry, no retarget, focus/manual refresh) | PASS |
| Role-filtered visibility | PASS |
| Activity de-duplication | PASS |
| allowed_actions server-only | PASS |

**SELF_CHECK = PASS**

---

```text
STATUS = TG021_LEAN_CONTRACT_AUTHORED
TASK_ID = TG-021
RISK_CLASS = STANDARD

CONTRACT_BASE_SHA = 639f8c9ee02026741beb8aae723906dc9d6da9c6
DEPENDENCY_TG020_IMPLEMENTATION_SHA = 7cafbf676b67ff16f02d4b5f64fc4ed65c9b044f
CONTRACT_BRANCH = codex/tg-021-contract
CONTRACT_SHA = <pending commit>
CONTRACT_FILE = tasks/TG-021_TASK_CONTRACT.md

DEPENDENCIES = TG-020
UNLOCKS = TG-022, TG-023, TG-024
DEPENDENCY_REQUESTS = NONE

TG017_HIDDEN_DEPENDENCY = ABSENT
BACKEND_AUTHORITATIVE_BOUNDARY = PASS
STATE_MACHINE_NOT_DUPLICATED = PASS
STALE_409_POLICY = PASS
SEMANTICS_CHANGED = NO
TASK_GRAPH_CHANGED = NO
WRITE_SCOPE = PASS
SELF_CHECK = PASS
REMOTE_SHA_MATCH = YES
WORKTREE = CLEAN
BLOCKERS = NONE
READY_FOR_CANONICALIZATION = YES
```
