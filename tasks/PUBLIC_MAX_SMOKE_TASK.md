# PUBLIC-MAX-SMOKE — baseline deployment

## BASE_SHA
`5045dd220b85bbd89038821aac110ec46c44a9d3`; HEAD проверен перед переносом.

## PURPOSE
Развернуть текущий MVP на подготовленном VPS и получить честное live MAX evidence.

## REQUIRED CONTEXT
Поручение команды, `AGENTS.md`, actual routes/config/contracts на BASE_SHA,
`docs/09_HACKATHON_CRITERIA.md`, draft delivery `22bf88be7ed9fc0c04d13b9cab13a455c7817a13`.

## IN SCOPE
Только delivery artifacts, синхронизация API, Docker build/start, миграции/seed,
постоянный HTTPS URL, webhook/MAX smoke, форма организаторов, evidence.

## NON-GOALS
Product UX fixes, изменение бизнес-логики, scope, нормативных продуктовых документов.

## DEPENDENCIES
Working MVP BASE_SHA; VPS, Caddy, Docker, доверенный MAX CA; organizer Bot Token.

## ALLOWED FILES
`Dockerfile`, `compose*.yaml`, `.dockerignore`, `.env.example`, `README.md`,
`openapi.yaml`, `DATA-API.yaml`, `scripts/delivery/**`, `docs/submission/**`, этот контракт.

## FORBIDDEN FILES
`apps/**`, `packages/**`, manifests/lockfile, Freeze/Spec и прочие исходники продукта.

## ACCEPTANCE CRITERIA
Actual registry/schema parity; Docker с Node 24.21.0/npm 11.19.0; DB persistent,
непубличные DB/app ports; Caddy HTTPS; реальный GET /me и subscription;
секреты root-only вне Git; smoke максимально далеко без имитации platform evidence.

## VERIFICATION COMMANDS
Delivery validate/check-registry; `docker compose build`, `up -d --wait`,
повторный migrate/seed, `down` без удаления volumes и `up`; external HTTPS/API/browser;
MAX GET /me/subscriptions и реальные webhook/initData, когда доступны.

## ESCALATION TRIGGERS
SPEC CONFLICT, несовпадение BASE_SHA, необходимое изменение forbidden files,
недоступность токена/платформы; organizer binding отмечать WAITING_ORGANIZER_BINDING.

## DELIVERABLE
Deploy candidate, постоянные URLs, безопасный отчёт с проверками и blockers.

## COMMIT / PUSH REQUIREMENTS
Ветка `codex/public-max-smoke`, человеческая Git identity, commit/push и полный SHA.
