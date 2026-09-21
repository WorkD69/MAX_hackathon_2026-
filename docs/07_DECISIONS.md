# Журнал существенных решений

Здесь фиксируются решения команды, влияющие на продукт или порядок разработки. Технические решения добавляются после проектирования архитектуры. Источники продуктовых решений: [Product Freeze](01_PRODUCT_FREEZE.md) и [Product Spec](02_PRODUCT_SPEC.md).

| ID | Решение | Основание |
| --- | --- | --- |
| ADR-001 | Новый репозиторий создан с нуля и служит единственным техническим источником истины для стадии CREATE. | Решение команды о чистом bootstrap. |
| ADR-002 | `PRODUCT_FREEZE_v1.0` имеет статус `APPROVED PRODUCT SCOPE`. | Утверждённый Product Freeze. |
| ADR-003 | Нормативный `docs/02_PRODUCT_SPEC.md` перенесён из `PRODUCT_SPEC_v1.0_FINAL.md` и имеет статус `APPROVED PRODUCT SPEC v1.0 / READY FOR CREATE`. | Явное решение команды о финальной версии; `FINAL_CLOSURE_REVIEW.md` подтверждает `PASS — READY FOR CREATE`. |
| ADR-004 | Агенты разработки не меняют продукт самостоятельно. | Приоритет Product Freeze и Product Spec над архитектурой и кодом. |
| ADR-005 | Изменение Product Freeze или Product Spec требует явного решения команды и записи в этом журнале. | Правило изменений Product Freeze. |
| ADR-006 | Собственный публичный API не входит в обязательный MVP и имеет низкий приоритет. | Product Freeze, разделы 15 и 21; официальный кейс, с. 7. |
| ADR-007 | Реальные интеграции с CRM и ГИС ЖКХ не являются обязательным MVP. | Product Freeze, разделы 3, 15, 18–20. |
| ADR-008 | Модульный monolith: одна Mini App + один backend + PostgreSQL | Минимальный достаточный topology |
| ADR-009 | TypeScript, React/Vite, Fastify, Kysely, PostgreSQL | Один язык, прозрачные transactions, скорость разработки |
| ADR-010 | Case = consistency boundary с relational current projection | Product invariants сформулированы вокруг одного Case |
| ADR-011 | История = append-only `CaseEvent`, без full event sourcing | Immutable semantic history без replay complexity |
| ADR-012 | Explicit business commands, generic PATCH state запрещён | State — следствие business action |
| ADR-013 | Concurrency = transaction + `SELECT FOR UPDATE` Case + target IDs + DB constraints | Простая доказуемая INV-044/045 consistency |
| ADR-014 | Mutating commands используют idempotency keys | Retry/double-click без duplicate facts |
| ADR-015 | Role-filtered snapshot + backend `allowed_actions` | Нет frontend state machine/security-by-CSS |
| ADR-016 | MAX auth: raw initData validated server-side; Bot Token server-only | Platform trust boundary |
| ADR-017 | DEMO_MODE: real MAX session + effective synthetic actor | Реальные permission rules при одном эксперте |
| ADR-018 | Real MAX notification через transactional outbox | External failure не создаёт duplicate Result |
| ADR-019 | Attachment bytes в PostgreSQL для MVP | Один persistent dependency |
| ADR-020 | Configuration relevant fields snapshot в Case | Старые Cases не меняют смысл после config update |
| ADR-021 | Repeat demo = новый DemoRun/new Case; старый Case не reset'ится | Immutable history + repeatability |
| ADR-022 | Maintenance reseed отделён от product actions | Recovery без изменения lifecycle |
| ADR-023 | Public MAX transport = Webhook; MAX не входит в Docker | Production-like integration без fake platform |
| ADR-024 | Versioned migrations + idempotent seed | Reproducibility |
| ADR-025 | No WebSocket/SSE; refetch after command/conflict/focus | MVP simplicity |
| ADR-026 | Real DB concurrency tests + manual mobile/web MAX gate | Доказательство invariants и platform compatibility |
