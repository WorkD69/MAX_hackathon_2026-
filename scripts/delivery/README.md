# Delivery-проверки и final sync

Эти scripts не регистрируют product routes и не меняют feature rules.
Root manifests/lockfile остаются без изменений. Запуск из корня clean checkout.

## Проверить draft

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
npx --no-install tsc -p scripts/delivery/tsconfig.api.json
node scripts/delivery/generate-api.mjs
node scripts/delivery/validate.mjs
python scripts/delivery/validate-openapi.py
docker compose config --quiet
git diff --check
```

Генератор использует **merged** exports `@max-smart-city/contracts`. Необходимы actual route schemas,
а не только ручные OpenAPI описания. Draft fallback двух public read схем явно marked PENDING_MERGE.
`--final` требует отсутствия этих fallback; остальные actual schema/auth/response details сверяет final owner.
Документ сохраняет `FINAL_SYNC_REQUIRED=YES` даже при успешной syntax validation.
Host compile — structure proof; exact pinned Docker build отдельно. `.env` содержит рабочие локальные
значения; `docker compose config` запускать с `--quiet`, не сохранять полный resolved config в evidence.

`validate.mjs` проверяет четыре YAML, уникальность keys/check IDs, OpenAPI component refs, JSON Schema,
DATA-API coverage/request fixtures, env parity/typed config, Compose topology, Dockerfile/ignore/lock structure,
pattern secret scan текущих tracked/new files. Ephemeral config secrets используются только в памяти.
`validate-openapi.py` валидирует документ официальной OAS 3.1 schema, затем semantic validator;
печатает URL и SHA256 schema для воспроизводимого evidence. Нужен internet к official schema.
Syntax PASS не является runtime route или live MAX PASS.

## Final TG-029 sync

1. Integration Agent объединяет final TG-029 и delivery branch, не переносит feature implementation
   в этот delivery task. Проверяет чистый checkout и фиксирует actual stable base.
2. Сверить actual API/web registry, config ENV_KEYS, workspace build и seed entrypoints.
   Проверить static serving, DB/readiness, in-process worker и webhook lifecycle final main entrypoint.
   Нельзя исправлять отсутствующие feature seams в delivery entrypoint/replacement registry.
3. Обновить **только delivery** catalog в `generate-api.mjs`: actual schema names, exact paths/methods,
   auth, multipart/body variants, role-filtered snapshot, success и error codes. Pending contribution
   schemas должны быть merged; current/actual Zod refinements остаются runtime validation.
4. `node scripts/delivery/generate-api.mjs --final`, затем оба валидатора.
5. TG-029 owner экспортирует actual runtime `onRoute` events из canonical factory/main composition в
   JSON `{method,url,schema?}[]`; без initData/token/env. Нельзя собирать новый test-only app registry.
   Сверить exact method/path coverage:

   ```sh
   node scripts/delivery/check-registry.mjs /absolute/path/actual-onRoute-registry.json
   ```

   Проверка игнорирует automatic HEAD и frontend static routes; учитывает API/health/integrations.
   Дополнительно actual schemas/auth/body/response parity проверяются TG-029 owner на том же SHA;
   JSON Schema не описывает все transaction/refinement rules.
6. Заполнить Bot/Mini App/API origin, TG-029 SHA и доступы в README/checklist/DATA-API/OpenAPI/PDF source.
   OpenAPI/Data base URL — origin **без** `/api/v1`, поскольку paths уже содержат prefix.
   Обновить draft flags только после закрытия runtime и live gates; generator сейчас намеренно
   всегда оставляет YES, поэтому final owner должен согласованно обновить metadata/validator assertions.
7. Commit final delivery sync; Integration Agent получает immutable **submission SHA**, включающий
   файлы доставки. Не пытаться вписать SHA commit внутрь самого commit: SHA меняется от такой записи.
   Передайте SHA в `.env`/image build и submission form/внешний first-slide final export.
   Технический PDF final export со SHA можно передать отдельным submission artifact, не менять fixed source.
8. Из clean submitted checkout: `docker compose up --build`; выполнить весь VERIFICATION runbook,
   exact pinned toolchain/build ≤5 min, volume restart, web/mobile/MAX notification/download.
   Сравнить immutable deployed build_sha с submitted SHA, хранить secrets вне Git.
9. Зафиксировать итоговое evidence и offline archive/checksum при необходимости. Оставить endpoint online.

## Docker build evidence

```sh
node scripts/delivery/measure-build.mjs
```

Скрипт требует clean checkout и Docker Engine. Сначала отдельно pull закреплённых node/postgres base
images; затем измеряет `docker compose build --no-cache app`. Evidence JSON не содержит env secrets.
Если Engine недоступен, результат DEFERRED, exit 2. ≤300 секунд ещё не означает functional startup PASS.
Full build не выполнялся на машине автора из-за отсутствующего Docker Engine.

## PDF и synthetic fixture

`presentation.json` — редактируемое содержимое слайдов, все claims помечены как ожидаемые/непроверенные.
`python scripts/delivery/build-presentation.py` создаёт PDF draft с technical first slide; требует
reportlab/pypdf и шрифт с кириллицей. Final команда меняет source/адреса и экспортирует итоговый PDF.
Проверить render всех страниц до сдачи, не выдавать draft за final presentation.
`node scripts/delivery/synthetic-file.mjs <absolute-output-path>` создаёт PNG с SYNTHETIC marker,
без фото/PII и без перезаписи существующего файла.
