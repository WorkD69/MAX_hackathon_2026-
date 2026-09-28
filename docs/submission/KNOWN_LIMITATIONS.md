# Ограничения и незакрытые delivery gates

`FINAL_SYNC_REQUIRED = YES`. Draft contract source SHA:
`6b97fed7dd87cf7ed3281314d0a85a0b9e2f4328`. Это не final submission candidate.

| Gate | Что ещё требуется |
| --- | --- |
| TG-029 runtime | Final API/web registry, DB/readiness, static assets, worker и webhook composition |
| Actual startup | Текущий main entrypoint имеет только health/system; default readiness отрицательная. Из текущего draft нельзя получить working MVP одним build |
| Route parity | Сверить final actual onRoute export и schemas с generated OpenAPI/DATA-API; все 44 contract operations пока не объявляются зарегистрированными |
| Pending schemas | `create-options`, `contractor-candidates` имеют PENDING_MERGE fallback точных contribution shapes; final generation обязана использовать merged Zod exports |
| StartDemoRun | На базе response не содержит новый token. При final sync проверить canonical start/session delta и выдачу actor-null session нового run |
| Role projection | Убедиться, что final Resident schema включает актуальные actionable clarification requests; использовать final exported role schemas |
| Attachments | Final metadata/stream/download-capability transport и ошибки TG-015/017 требуют сверки; draft описывает нормативную поверхность, не live proof |
| Docker Engine | На машине автора CLI есть, Linux Engine недоступен. Full Docker build/up, persistence и ≤5 min evidence отложены |
| Toolchain | Host Node 24.14.1/npm 11.11.0; structural compile проведён с ним, exact pinned runtime proof нужен в Docker/закреплённом runtime |
| VPS / MAX | Реальный HTTPS routing, CA-chain, subscription, Bot launch, notification и web/mobile download подтверждаются отдельно |
| Submission identity | После integration назначить clean final SHA, собрать этот SHA и сравнить `/api/v1/system/info.build_sha` |
| Presentation | PDF draft содержит placeholders и не заменяет заполненный final PDF с доступами |

Ошибки 400/422 в некоторых request/content negatives требуют final actual HTTP-schema проверки:
Zod structural validation и domain validation могут иметь разные codes. В DATA-API это отмечено.
JSON Schema не выражает все Zod refinements, idempotency fingerprint и transaction authorization rules.
API success в документации — ожидаемый контракт, не свидетельство прохода live сценария.

Приоритетный сценарий — неаварийное отопление / стояк. Текущий TG-008 каталог сантехники/электрики
дополняется UK Admin конфигурацией SYNTHETIC отопительной категории; seed и продуктовые правила
этим delivery-пакетом не меняются.

Границы MVP: нет CRM/ГИС ЖКХ интеграции, официальной регистрации в ГИС, платежей, юридически значимых
актов/подписей, универсальных SLA, live free-slot integration, маршрутизации мастеров и автоматического
юридического определения ответственного. Один Case, восемь состояний и четыре роли сохраняют
утверждённый workflow. Реальные внешние интеграции нельзя утверждать без live evidence.
Outbox delivery at-least-once; сбой MAX после commit Result не откатывает Result и не требует
повторной отправки Result. Потенциальный provider duplicate не является новым бизнес-результатом.

Pattern secret scan покрывает распространённые форматы токенов/private keys и пустоту `.env.example`;
он не доказывает отсутствие любых неизвестных форматов секретов или секретов в истории Git.
Final упаковка требует дополнительной проверки владельцем секретов и артефактов evidence.
