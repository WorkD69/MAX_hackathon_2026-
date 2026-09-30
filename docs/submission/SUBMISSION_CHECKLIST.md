# Checklist финальной сдачи

Application base SHA: `332ac4aee174a8743324b82b38853b3a3751d2e9`.
FINAL_SUBMISSION_SHA проверенного source package: `4f719b0d9d2f40cee8ab16c61b86b40b63ca7d72`.
Поверх него идёт один documentation-only cleanup commit; его SHA возвращают `git rev-parse HEAD`
и отчёт к итоговому ZIP. Production всё ещё может показывать application SHA до redeploy.

## Пакет

- [x] Source submission branch создана ровно от application SHA; application code не изменён.
- [x] Source commit `4f719b0…` отправлен без force push; remote branch и tag
  `submission-final-2026-09-30` указывают на этот SHA.
- [x] Dockerfile, Compose, `.dockerignore`, `.env.example`, README, manifests/lockfile, migrations,
  idempotent seed, OpenAPI, DATA-API, synthetic data docs, ограничения и runbook включены.
- [x] OpenAPI 3.1 проходит официальную schema и semantic validation; DATA-API содержит 46 checks;
  method/path parity с runtime `onRoute` — **PASS, 45/45**, stale routes нет.
- [x] `.env.example` содержит только пустые значения секретов и placeholders публичных URL.
- [x] Финальная PDF-презентация — [«Хакатон MAX — Умный город — Two pizza.pdf»](<../../Хакатон MAX — Умный город — Two pizza.pdf>).
  13 слайдов; первый содержит Bot/Mini App/API URL, repo, полный SHA `4f719b0…` и маршрут проверки.
- [x] ZIP `Хакатон MAX — Умный город — Two pizza.zip` содержит PDF в корне и исключает `.git`,
  `node_modules`, `dist`, `.env`, production credentials, логи, временные файлы и старые презентации.
- [x] ZIP открывается и занимает меньше 50 MB; повторный secret scan распакованного архива —
  **PASS, 0 secrets**. SHA-256 передаётся рядом с файлом, вне архива.

## Docker из clean checkout source commit

- [x] `docker compose config --quiet` и `docker compose up --build -d` завершились с exit 0.
- [x] `docker compose build --no-cache app` занял **30.1 s** без первоначальных image pulls; лимит 300 s.
- [x] Migrations и повторный idempotent seed успешны; контрольные count/created_at не изменились.
- [x] Web — 200, `/health/live` — 200, `/health/ready` — `ready` с DB/migrations/application checks.
- [x] `/api/v1/system/info.build_sha` = `4f719b0d9d2f40cee8ab16c61b86b40b63ca7d72`.
- [x] App доступен только на loopback host port; PostgreSQL не публикует host port.
- [x] **PERSISTENCE = PASS:** отдельная контрольная запись PostgreSQL сохранилась после
  `docker compose down` / `docker compose up --build`; readiness и BUILD_SHA повторно проверены.

## Живая демонстрация и границы evidence

- [ ] Пользователь завершает final smoke Bot → Mini App в MAX web/mobile, signed initData,
  четыре role views, уведомление и attachment download. Локальный Docker smoke не заменяет эту проверку.
- [ ] Пользователь подтверждает happy path до `COMPLETED`, замечание и N+1 того же Case,
  contractor rejection → B, same-executor rework и fresh bootstrap в другом клиенте MAX.
- [ ] Команда подтверждает production VPS CA mount, TLS/Caddy и доступность сервиса на весь период оценки.
- [ ] Case/history/attachment bytes после production restart сверяются в пользовательском сценарии;
  локальный persistence PASS выше относится к DB volume probe.

## Итоговое evidence

| Поле | Значение |
| --- | --- |
| APPLICATION_BASE_SHA | `332ac4aee174a8743324b82b38853b3a3751d2e9` |
| FINAL_SUBMISSION_SHA (source package) | `4f719b0d9d2f40cee8ab16c61b86b40b63ca7d72` |
| PRESENTATION_PDF | `Хакатон MAX — Умный город — Two pizza.pdf`, 13 слайдов |
| DOCKER_BUILD | `PASS`, 30.1 s, clean checkout, no cache |
| FINAL_ROUTE_PARITY | `PASS`, 45 runtime routes; 46 DATA-API checks |
| PERSISTENCE | `PASS`, DB probe после `down`/`up` |
| SECRET_SCAN | `PASS`, 0 secrets в submission ZIP |
| REMOTE_SHA_MATCH | `PASS` для source commit и tag `submission-final-2026-09-30` |
| ZIP | `Хакатон MAX — Умный город — Two pizza.zip`, присутствует; hash в сопроводительном отчёте |

Точные команды, результаты и пределы проверки — в [VALIDATION.md](VALIDATION.md).
Секреты, initData, session token, chat ID и персональные данные в evidence не сохранять.
