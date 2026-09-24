# TG-010 — MAX initData auth, MaxIdentity и application session

## 1. Identity / BASE_SHA

`TASK_ID=TG-010`; `RISK_CLASS=CRITICAL`; `BASE_SHA=0332bf029ab12a1217f1aef5f6bf0f26e6a2faca`; ветка `codex/tg-010-contract`; primary owner `LANE-A`. Контракт создаётся в отдельном checkout от exact `BASE_SHA`.

## 2. Goal

После будущей реализации сервер валидирует raw MAX `initData`, создаёт/обновляет real `MaxIdentity` и выдаёт короткую подписанную Bearer application session. `POST /api/v1/auth/max` и `GET /api/v1/session` соответствуют `docs/05_INTERFACE_CONTRACTS.md` §2; reload может выполнить новый MAX bootstrap и восстановить current demo context.

## 3. Canonical sources

`AGENTS.md`; `docs/01_PRODUCT_FREEZE.md`; `docs/02_PRODUCT_SPEC.md`; `docs/03_ARCHITECTURE.md` §§7.4, 10, 25; `docs/04_DATA_MODEL.md` §§6.5, 25, 29.3, 35; `docs/05_INTERFACE_CONTRACTS.md` §§1–3; `docs/07_DECISIONS.md` ADR-016/017; `docs/08_PROJECT_STATE.md`; `docs/ORCHESTRATOR_HANDOFF.md`; `tasks/BACKLOG.md`, `tasks/TASK_TEMPLATE.md`, `tasks/TASK_GRAPH.md` §TG-010. Фактические зависимости: `packages/contracts/src/{max,session,errors}.ts` (TG-002), `apps/api/src/config/{schema,types,load-config}.ts` и logging (TG-003), `packages/db/src/index.ts` и `packages/db/migrations/0001_foundation.ts` (TG-005).

**Официальный MAX snapshot:** [«Валидация данных»](https://dev.max.ru/docs/webapps/validation), просмотрено **2026-09-24**; опубликованная версия документа не указана. SHA-256 **`235ecfbbc444f6df8744eae1a2cc774a221bf649d3099943dfa314bcf16c21f2`** для UTF-8 текста официальной страницы, извлечённого web renderer из строк `L39–L105` включительно: удалить только префиксы `L<номер>: `, соединить строки LF без завершающего LF. Охвачены общий алгоритм, пример `WebAppData`, подготовка строки, derivation/signing и сравнение. При изменении источника до coding сверить protocol; существенное противоречие approved Architecture = `SPEC/INTEGRATION CONFLICT`, без самостоятельной замены алгоритма.

## 4. Dependencies / unlocks

`Depends On: TG-002, TG-003, TG-005`; `Unlocks: TG-011, TG-013, TG-019`; `Parallel With: TG-006, TG-009, TG-020`. Task Graph не меняется.

## 5. Allowed write scope

Для implementation: `apps/api/src/modules/auth/**`, `apps/api/src/modules/max-identity/**`, связанные repositories/tests в границах TG-010. Shared app composition — TG-029; central typed config — TG-003; root manifests/lockfile — Integration Agent по dependency request. На текущем этапе разрешён **только** `tasks/TG-010_TASK_CONTRACT.md`.

## 6. Forbidden scope

Не менять Product/Architecture/Data Model/Interface semantics, Task Graph, canonical `main` и права доступа (TG-011). Не доверять `initDataUnsafe`, клиентским role/organization/contractor ID или `startapp`; не приравнивать Mini App `user.id` к Bot API `user_id`. Не читать `process.env` вне TG-003 loader; не отправлять Bot Token клиенту; не сохранять application token в browser persistent storage, raw `initData`, токены или key material в БД/логах. Fake adapter не доказывает real MAX integration.

## 7. Required behavior / invariants

- **Вход и canonicalization.** `init_data` — внутреннее raw значение `WebAppData` из MAX Bridge, не URL целиком и не разобранный `initDataUnsafe`. Внешний URL fragment, если используется клиентом, обязан иметь уникальный `WebAppData`; сервер разбирает raw строку по `&`, пары по первому `=`, требует непустые уникальные ключи и ровно один `hash`. Ключи остаются исходными ASCII именами; значения URL-декодируются **ровно один раз** как UTF-8 (`decodeURIComponent` semantics: `+` остаётся `+`, `%2B` даёт `+`); ошибочные `%`/UTF-8 отвергаются. `hash` исключается; остальные пары сортируются лексикографически по ASCII ключу, собираются как `key=value` с разделителем LF (`0x0A`), без конечного LF. Не нормализовать JSON, пробелы, регистр или значения повторно.
- **Подпись.** По snapshot MAX: `secret_key = HMAC-SHA256(key=UTF8("WebAppData"), message=UTF8(MAX_BOT_TOKEN))`; ожидаемый `hash = lowercase-hex(HMAC-SHA256(key=secret_key bytes, message=UTF8(launch_params)))`. Принимать ровно 64 **lowercase** hex символа и сравнивать декодированные 32-байтовые подписи constant-time; неверная длина/hex — invalid format, несовпадение — invalid signature. Реализация: встроенный server-side **`node:crypto`** (`createHmac`, `timingSafeEqual`) из закреплённого root `engines.node=24.21.0`; никакой browser crypto или иной MAX protocol.
- **Pinned positive fixture.** Значения взяты из официального примера `WebAppData` (его `hash` там placeholder); тестовый Bot Token `TG010_TEST_BOT_TOKEN_2026`. Raw до `&hash=`: `chat=%7B%22id%22%3A12345%2C%22type%22%3A%22DIALOG%22%7D&ip=192.168.0.1&user=%7B%22id%22%3A67890%2C%22first_name%22%3A%22Max%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3Anull%2C%22language_code%22%3A%22ru%22%2C%22photo_url%22%3Anull%7D&query_id=4c0ab423-342b-4e45-aea4-2747dbc500cd&auth_date=1771409719`. Exact `launch_params`:

  ```text
  auth_date=1771409719
  chat={"id":12345,"type":"DIALOG"}
  ip=192.168.0.1
  query_id=4c0ab423-342b-4e45-aea4-2747dbc500cd
  user={"id":67890,"first_name":"Max","last_name":"User","username":null,"language_code":"ru","photo_url":null}
  ```

  `secret_key` hex = `a066dc60e06c1c52cf63ab62c68760347d5102f5d540cf774c8b356c5a8d5f3e`; expected `hash` = `4cc1bccc784cc661a1a8c2d158631c86f2fe610050af96b54f30450f45d489e6`. Это воспроизводимый derived vector, не опубликованное MAX значение hash. Для positive freshness test использовать управляемое время `auth_date + 300 s`.
- **Freshness.** Подпись проверяется до доверия полям. Требуются `auth_date` как целое Unix seconds, `user.id`, `chat.id` и `chat.type` из подписанных данных. `MAX_INIT_DATA_MAX_AGE_SECONDS`: default **300**, допустимый config range **60–3600**; `MAX_INIT_DATA_FUTURE_SKEW_SECONDS`: default **30**, range **0–300**, строго меньше max age. Принимать `-future_skew <= now - auth_date <= max_age` включительно; старее/дальше в будущем — `401 MAX_INIT_DATA_EXPIRED`. Формат/отсутствие полей — `400 INVALID_INIT_DATA_FORMAT`; bad HMAC — `401 MAX_INIT_DATA_INVALID_SIGNATURE`.
- **Identity / mapping.** Upsert по уникальному `mini_app_user_id` без duplicate row при гонке; signed `user.id`/`chat.id` сохраняются как точные строки без потери числовой точности. Только validated `chat.id/type` обновляют `delivery_chat_id/type`, readiness и timestamps. `bot_user_id` не выводится из Mini App `user.id`; existing `app_user_id` не перезаписывается клиентскими данными. `LINKED_CONFIRMED` возможен только с validated usable `delivery_chat_id/type` (TG-005 CHECK). Normal mode находит ровно один mapped `MaxIdentity` через DB unique `app_user_id`; при отсутствии mapping — `403 APP_USER_NOT_MAPPED`, при неоднозначном active binding — fail closed, без выбора first/latest. Demo mode сохраняет real identity отдельно от synthetic actor и server-side находит current ACTIVE DemoRun без создания нового при bootstrap.
- **Application session.** TG-003 `APP_SESSION_TTL_SECONDS`: default **900**, range **60–3600**; `APP_SESSION_SECRET` — server-only UTF-8 **32–4096 bytes**. Freeze wire format `v1.<base64url(UTF-8 JSON claims)>.<base64url(32-byte HMAC-SHA256)>`, tag над точными ASCII байтами `v1.<payload>` с ключом `APP_SESSION_SECRET`; единственный допустимый version `v1`, без client-selected algorithm. Claims: `schema_version=1`, session ID/nonce, real `max_identity_id`, effective `app_user_id`, selected role-binding identity/context, `demo_mode`, `demo_run_id` при demo, `iat` и `exp` в Unix seconds. `exp=iat+configured TTL`; `exp<=now`, bad version/signature/claims — reject, MAC comparison constant-time. `GET /api/v1/session` возвращает только authoritative current context после DB revalidation; token не замораживает права до expiry. Browser держит Bearer только runtime-memory; reload получает новый signed MAX bootstrap.

## 8. Dependency requests

`NONE`: `node:crypto` поставляется с exact Node `24.21.0` из root manifest; новая crypto library и правка shared manifest/lockfile не требуются. При невозможности использования этого pinned runtime — blocker к Integration Agent, без локальной замены crypto.

## 9. Acceptance criteria

Оба endpoint соответствуют TG-002 Zod request/response/error contracts и §2 Interface Contracts; invalid/expired/tampered initData не создаёт session. Подписанный chat target сохранён, normal mapping однозначен при конкурентном bootstrap, demo reload восстанавливает current run. Raw secret/session material отсутствует в persisted rows и логах. Application session подписана и истекает по typed config; TG-011 получает identity/context boundary, но права остаются его задачей.

## 10. Required tests

Обязательны: pinned positive vector и exact canonicalization bytes; `%`/UTF-8 malformed, duplicate key/`hash`, missing `hash`/`auth_date`/`user.id`/`chat.id/type`, bad signature, tampered signed value; expired/future даты на `300/301` и `30/31` секундах, configured max `3600/3601` и future `300/301`; session signing/version/claims/TTL `900`, expiry boundary и tamper; лог redaction (`init_data`, Authorization, Bot Token, session token); PostgreSQL concurrent upsert/unique app mapping; отсутствие raw `initData`, Bot Token, `APP_SESSION_SECRET` и session token в DB. Запускать targeted TG-010 tests, `npm run typecheck` и `npm test`, показать результаты.

## 11. Git / integration handoff

Contract authoring: только этот файл, commit/push `codex/tg-010-contract` от exact `BASE_SHA`, без push `main` и без review artifact. После одного independent CRITICAL contract review implementation получает полный SHA контракта, pinned MAX snapshot/vector, результаты checks и dependency boundary; Integration Agent занимается shared composition.

## 12. Blocker protocol

Остановить затронутую работу при `SPEC/INTEGRATION CONFLICT`, изменении official MAX signing semantics, неверном `BASE_SHA`, несовместимости TG-002/003/005, невозможности pinned `node:crypto` или выходе за write scope; сообщить exact source/расхождение. При `FIX_REQUIRED` — один полный batch findings, один batch fix, targeted closure.
