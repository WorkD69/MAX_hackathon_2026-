# TG-010 — TEST-only signed initData delta

## Identity and scope

`TASK_ID = TG-010`; `RISK_CLASS = CRITICAL`; `TYPE = TEST security delta`; `AUTHORING_BASE_SHA = 28401166a340407297cfb942fd9a8bf978e6c2a2` (разрешённая isolated base для `codex/canonical-test-auth-delta`). Этот документ задаёт только изменение TEST auth seam; существующий MAX protocol, normal mapping, session и product semantics не меняются. Источники: `docs/03_ARCHITECTURE.md` §§10, 26.7–26.8; `docs/05_INTERFACE_CONTRACTS.md` §§2.1–2.2, 37; `tasks/TG-003_TASK_CONTRACT.md` §24; `tasks/TASK_GRAPH.md` TG-010/TG-019/TG-027/TG-028.

TG-010 зависит от TG-002/TG-003/TG-005 и владеет `apps/api/src/modules/auth/**`, `apps/api/src/modules/max-identity/**` и связанными auth tests по Task Graph. TG-003 единолично меняет typed config/startup/redaction; TG-019 владеет только fake outbound/webhook compatibility. TG-027/TG-028 используют seam после integration. В данном authoring commit production code, tests и Task Graph не изменяются.

## Required behavior and boundary

- Единственный разрешённый TEST профиль: injected typed `TEST_AUTH_DEMO_PROFILE === 'TEST_DEMO_E2E_V1'` вместе с decoded 32-byte `TEST_MAX_INIT_DATA_SIGNING_KEY` и точной тройкой `APP_ENV=test`, `MAX_ADAPTER_MODE=fake`, `DEMO_MODE=true`. Launcher input `test_auth_demo_profile` использует ровно тот же literal; `TEST:*` не принимается. Marker не является identity claim, `initData` field или actor selector.
- Launcher генерирует fresh synthetic `user`/`chat`/`auth_date`, канонизирует параметры существующим MAX форматом и вычисляет `hash = HMAC-SHA256(decoded TEST key, canonical launch params)` в lowercase hex. Browser получает только итоговую raw signed `initData` и отправляет стандартный `{ "init_data": "..." }` на `POST /api/v1/auth/max`. Test key и signing function в browser bundle не попадают.
- TG-010 выбирает **ровно один** signing material до HMAC проверки: прямые 32 decoded TEST bytes только при точном разрешённом профиле, иначе существующую derivation из server-only `MAX_BOT_TOKEN` по pinned MAX algorithm. В production/live TEST bytes недоступны; при invalid signature нет fallback и второй попытки. Canonicalization, constant-time signature comparison, freshness и error codes остаются существующими.
- Успешный TEST request проходит тот же `AuthService.bootstrap`: validated identity и `chat.id/type` persisted в `MaxIdentity`, затем та же DemoRun resolution и обычная application session issuance. `GET /api/v1/session` и per-request authorization остаются настоящими. Запрещены auth mock, произвольный actor endpoint, signing endpoint, client role/identity authority и запись секретов/raw `initData` в logs, system info или response.

## Acceptance and tests for implementation owner

При точном профиле: свежая подпись проходит через реальный HTTP route, сохраняет validated identity/delivery binding и выдаёт обычную session; corrupted signature, tampered user/chat, malformed payload, expired и future `auth_date` отклоняются canonical 400/401 без persistence/session. Официальные live-векторы с Bot Token продолжают проходить в live mode, а TEST-подпись там отвергается; live подпись не принимается в TEST profile. Отдельные тесты фиксируют отсутствие dual-key попытки и no-secret-output boundary. Fake outbound delivery может проверяться TG-019, но не является auth acceptance или live MAX evidence.

Implementation выполняется только после independent review этого CRITICAL delta и интеграции TG-003 config. Владелец получает отдельный implementation `BASE_SHA`, проверяет его перед кодом и передаёт commit/SHA/checks Integration Agent. При конфликте с Product Freeze/Spec — `SPEC CONFLICT`; при отсутствии typed config или несовместимом launcher profile — конкретный dependency blocker, без обходного auth path.
