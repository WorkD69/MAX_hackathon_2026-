# Checklist финальной сдачи

Application source of truth: `332ac4aee174a8743324b82b38853b3a3751d2e9`.
Production с этим application SHA проходит final smoke пользователя. Галочка ставится только после
проверки именно submission candidate и записи evidence. Итоговый commit SHA появится после интеграции;
его нельзя заранее записать внутрь того же commit.

## Пакет исходников

- [ ] Branch `codex/final-submission-freeze` создан ровно от application SHA; application code не менялся.
- [ ] Один submission commit, полный SHA, push без force, remote SHA совпадает.
- [ ] Tag `submission-final-2026-09-30` создан только после успешных проверок.
- [ ] Включены Dockerfile, compose.yaml, .dockerignore, .env.example, README.md, package.json,
  package-lock.json, migrations, seed/demo data, OpenAPI, DATA-API, synthetic data docs,
  limitations и verification runbook.
- [ ] OpenAPI и DATA-API проходят schema/semantic validation и фактическую method/path/schema/auth/body
  сверку с final runtime route registry; stale routes отсутствуют.
- [ ] Secret scan всего submission tree: 0 Bot Token, webhook secret, production.env, root password,
  SSH/private keys, private certificates, session/initData и реальных credentials.
- [ ] `.env.example` содержит только пустые значения секретов и placeholders публичных URL.
- [ ] Чистый ZIP `MAX_Smart_City_Two_pizza_<SHORT_SHA>.zip`: запрещённые локальные/build/temp файлы
  исключены, список архива проверен, SHA-256 записан.
- [ ] Финальная PDF-презентация приложена, технический первый слайд содержит Bot/Mini App/API URL,
  repo/SHA и маршрут проверки. Пока финальный PDF не найден: [место для него](README.md).

## Docker из clean checkout

- [ ] `docker compose config --quiet` проходит с локальным `.env`.
- [ ] `docker compose up --build` завершает build, migrations, idempotent seed и поднимает web/API/PostgreSQL.
- [ ] Время build ≤ 300 секунд без первоначального pull; записаны параметры машины/cache.
- [ ] `/health/ready` возвращает 200 и реальные DB/migrations/application checks; `/health/live` 200.
- [ ] `/api/v1/system/info.build_sha` равен SHA commit, из которого собран проверяемый образ.
- [ ] `app` доступен на `127.0.0.1:${APP_PORT:-3000}`; PostgreSQL не имеет host `ports:`.
- [ ] После `docker compose down` / `docker compose up --build` сохранены Case/history/attachment.
- [ ] VPS CA mounted read-only, TLS verification включена, Caddy проксирует на loopback app.

## Демонстрация и доступность

- [ ] Bot [max.ru/t793_hakaton_max_bot](https://max.ru/t793_hakaton_max_bot) открывает Mini App
  [157-22-231-21.sslip.io](https://157-22-231-21.sslip.io/) в MAX web и mobile.
- [ ] Публичный API [157-22-231-21.sslip.io/api/v1](https://157-22-231-21.sslip.io/api/v1)
  доступен по HTTPS на время экспертной проверки.
- [ ] Signed MAX initData bootstrap и все четыре role views проходят без публикации tokens/initData.
- [ ] Happy path до `COMPLETED` с замечанием и N+1 в том же Case; повтор DemoRun сохраняет историю.
- [ ] Initial contractor rejection → B; same-executor rework; A→B authority handoff.
- [ ] Реальное MAX уведомление после SubmitResult и attachment download в web/mobile подтверждены.
- [ ] Проверено сохранение состояния после restart и fresh bootstrap того же эксперта.
- [ ] Решение оставлено online на весь период экспертной проверки.

## Итоговое evidence

| Поле | Значение |
| --- | --- |
| APPLICATION_BASE_SHA | `332ac4aee174a8743324b82b38853b3a3751d2e9` |
| FINAL_SUBMISSION_SHA | `PENDING` |
| PRODUCTION_APPLICATION_SHA | `332ac4aee174a8743324b82b38853b3a3751d2e9` |
| BOT_LINK | `https://max.ru/t793_hakaton_max_bot` |
| MINI_APP_HTTPS | `https://157-22-231-21.sslip.io/` |
| API_BASE | `https://157-22-231-21.sslip.io/api/v1` |
| DOCKER_BUILD_SECONDS | `NOT_VERIFIED` |
| FINAL_ROUTE_PARITY | `NOT_VERIFIED` |
| PERSISTENCE | `NOT_VERIFIED` |
| SECRET_SCAN | `NOT_VERIFIED` |
| FINAL_PDF | `MISSING` |
| ZIP / ZIP_SHA256 | `PENDING` |
| REMOTE_SHA_MATCH | `NOT_VERIFIED` |

Секреты и персональные данные не записывать в evidence. Проверочный журнал —
[VALIDATION.md](VALIDATION.md); пошаговый сценарий — [VERIFICATION.md](VERIFICATION.md).
