# Проверки финального delivery package

Эти scripts не регистрируют product routes и не меняют feature rules.
Root manifests/lockfile остаются без изменений. Запуск из корня clean checkout.

## Проверить API package

Host prerequisites: Node 24.21.0/npm 11.19.0. YAML, AJV и Zod уже закреплены root lockfile.
Для Python OpenAPI validator нужны `PyYAML`, `jsonschema`, `openapi-spec-validator` (на машине автора
доступны); это внешняя проверка delivery, не application dependency. Версии доступных инструментов
закреплены в `scripts/delivery/requirements-validation.txt`; при необходимости установить в отдельное
Python окружение через `python -m pip install -r scripts/delivery/requirements-validation.txt`.

```sh
npm ci
npm run build --workspace @max-smart-city/contracts
npm run build --workspace @max-smart-city/domain
npm run build --workspace @max-smart-city/db
npm run build --workspace @max-smart-city/api
npx --no-install tsc -p scripts/delivery/tsconfig.api.json
node scripts/delivery/generate-api.mjs
node scripts/delivery/check-registry.mjs
node scripts/delivery/validate.mjs
python scripts/delivery/validate-openapi.py
docker compose config --quiet
git diff --check
```

Генератор использует merged exports `@max-smart-city/contracts` на application base
`332ac4aee174a8743324b82b38853b3a3751d2e9`. Health payloads описаны по
реальному `apps/api/src/modules/health/plugin.ts`. `check-registry.mjs` снимает
`onRoute` events из настоящего `buildApp` в памяти, с ephemeral secrets, без
`listen`, DB-запросов или MAX-запросов. Он сверяет exact method/path с OpenAPI,
включая `/downloads/{capability}`; automatic HEAD и static frontend routes исключены.
Host compile — structure proof; exact pinned Docker build отдельно. `.env` содержит рабочие локальные
значения; `docker compose config` запускать с `--quiet`, не сохранять полный resolved config в evidence.

`validate.mjs` проверяет четыре YAML, уникальность keys/check IDs, OpenAPI component refs, JSON Schema,
DATA-API coverage/request fixtures, env parity/typed config, Compose topology, Dockerfile/ignore/lock structure,
pattern secret scan текущих tracked/new files. Ephemeral config secrets используются только в памяти.
`validate-openapi.py` валидирует документ официальной OAS 3.1 schema, затем semantic validator;
печатает URL и SHA256 schema для воспроизводимого evidence. Нужен internet к official schema.
Schema validation не подтверждает live MAX или production deployment.

OpenAPI/DATA-API содержат публичный origin без `/api/v1`, поскольку paths уже содержат prefix.
OpenAPI schemas — JSON Schema-представление canonical Zod contracts. Runtime Zod refinements,
transaction rules, role projections и live MAX проверяются отдельными smoke checks.

## Docker build evidence

```sh
node scripts/delivery/measure-build.mjs
```

Скрипт требует clean checkout и Docker Engine. Сначала отдельно pull закреплённых node/postgres base
images; затем измеряет `docker compose build --no-cache app`. Evidence JSON не содержит env secrets.
Если Engine недоступен, результат DEFERRED, exit 2. ≤300 секунд ещё не означает functional startup PASS.

## PDF и synthetic fixture

`node scripts/delivery/synthetic-file.mjs <absolute-output-path>` создаёт PNG с SYNTHETIC marker,
без фото/PII и без перезаписи существующего файла.
