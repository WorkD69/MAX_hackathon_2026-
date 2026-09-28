# MAX Smart City — публичный baseline MVP

SOURCE_SHA: `5045dd220b85bbd89038821aac110ec46c44a9d3`.
Delivery перенесён из `22bf88be7ed9fc0c04d13b9cab13a455c7817a13` и синхронизирован
с actual factory: 45 API/health/webhook/download operations, 46 DATA-API checks.
Продуктовый код не менялся.

- Mini App: https://157-22-231-21.sslip.io/ — фактический frontend entrypoint `/`.
- API: https://157-22-231-21.sslip.io/api/v1
- Bot: https://max.ru/t792_hakaton_max_bot
- Readiness: https://157-22-231-21.sslip.io/health/ready
- Build identity: https://157-22-231-21.sslip.io/api/v1/system/info
- Webhook: https://157-22-231-21.sslip.io/integrations/max/webhook

`/launch` не является маршрутом продукта. Публичный браузер без MAX initData показывает
приглашение открыть приложение через MAX. DEMO_MODE не отключает HMAC или серверную авторизацию.
Для полноценного Bot → Mini App требуется organizer binding. Форму организаторов пользователь
отложил: `ORGANIZER_FORM=DEFERRED_BY_USER`; адрес остаётся постоянным для следующих redeploy.

## Запуск на подготовленном VPS

Docker Engine/Compose, Caddy на хосте, Git checkout deploy SHA.
Образ закрепляет Node **24.21.0**, npm **11.19.0** и использует существующий lockfile.
PostgreSQL хранит данные, включая файлы, в persistent named volume. 5432 не публикуется.
App доступен хостовому Caddy только на **127.0.0.1:3000** через `compose.vps.yaml`.

Bot Token вводится напрямую в `/etc/max-smart-city/bot-token` через защищённый SSH stdin.
Файл принадлежит root, mode 600. Не вводить токен в чат, Git или аргументы команды.

```sh
sudo python3 scripts/delivery/bootstrap-secrets.py "$(git rev-parse HEAD)"
sudo docker compose --env-file /etc/max-smart-city/production.env -f compose.yaml -f compose.vps.yaml config --quiet
sudo docker compose --env-file /etc/max-smart-city/production.env -f compose.yaml -f compose.vps.yaml build
sudo docker compose --env-file /etc/max-smart-city/production.env -f compose.yaml -f compose.vps.yaml up -d --wait
```

Bootstrap генерирует разные случайные DB/session/webhook secrets только на сервере,
сохраняет существующие при redeploy; production.env принадлежит root, mode 600.
`migrate` выполняет canonical migrations и idempotent SYNTHETIC seed до старта app.
Test auth keys в production не передаются.

Caddyfile для существующего hostname:

```caddyfile
157-22-231-21.sslip.io {
    reverse_proxy 127.0.0.1:3000
}
```

MAX CA: `/etc/max-smart-city/russian-trusted-root-ca.pem` → readonly mount
`/etc/ssl/custom/max-root-ca.pem`; `NODE_EXTRA_CA_CERTS` указывает на mount.
TLS validation остаётся включённой. App reconciles official webhook subscription автоматически.

## Проверки

После сборки dependencies/contracts/API на точном toolchain:

```sh
node scripts/delivery/generate-api.mjs --final
node scripts/delivery/export-registry.mjs docs/submission/ACTUAL_REGISTRY.json
node scripts/delivery/check-registry.mjs docs/submission/ACTUAL_REGISTRY.json
node scripts/delivery/validate.mjs
python scripts/delivery/validate-openapi.py
```

Production container: `node scripts/delivery/max-smoke.mjs` через `compose exec -T app`.
Вывод содержит безопасную bot identity и результаты GET /me/subscriptions/webhook secret;
не содержит токен или секрет. Контролируемый webhook не является real MAX evidence.

Проверка сохранности: `compose down`, затем `compose up -d --wait`; **без удаления volumes**.
Сравнить IDs/counts записей до и после. Обновления публиковать на том же URL.

Экспертный сценарий и ограничения: `docs/submission/VERIFICATION.md`,
`docs/submission/KNOWN_LIMITATIONS.md`. OpenAPI описывает реальные Zod exports;
transaction/context refinements остаются runtime checks. Презентация в пакете — исторический draft,
не итоговая подача. Эта задача закрывает baseline deployment, не финальную UX acceptance.
