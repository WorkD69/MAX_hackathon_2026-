# Delivery scripts

Синхронизация с SOURCE_SHA `5045dd220b85bbd89038821aac110ec46c44a9d3`.
Команды запуска и серверная конфигурация — в корневом README.

- `generate-api.mjs --final`: canonical Zod → OpenAPI 3.1 и DATA-API; 45 operations.
- `export-registry.mjs`: наблюдает canonical buildApp через Fastify diagnostics/onRoute,
  без replacement composition, listen, Bot Token, network и записи в БД.
- `check-registry.mjs`: bidirectional method/path parity, включая `/downloads/:capability`.
- `validate.mjs`: YAML/JSON Schema/fixtures, env parity, typed config, compose/pins, secret pattern scan.
- `validate-openapi.py`: независимый OpenAPI validator.
- `migrate.mjs`: canonical migration и idempotent SYNTHETIC seed.
- `bootstrap-secrets.py`: root-only production.env на VPS; сохраняет DB/session/webhook secrets при redeploy.
- `max-smoke.mjs`: безопасные GET /me, subscriptions и контролируемый webhook secret smoke.
- `healthcheck.mjs`: readiness для Docker healthcheck.

Build SHA передаётся в image ARG; `/api/v1/system/info` возвращает immutable image identity.
Не сохранять resolved compose config, токены, initData или session tokens в evidence.
Контролируемые проверки не подтверждают фактическую работу Mini App внутри MAX.
