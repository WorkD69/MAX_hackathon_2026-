# Fresh validation delivery draft

Дата: 28.09.2026. База `6b97fed7dd87cf7ed3281314d0a85a0b9e2f4328`.
Ветка `codex/final-delivery-package`. Все изменения — delivery scope из DELIVERY_TASK.
`FINAL_SYNC_REQUIRED = YES`, final TG-029 SHA отсутствует, final route parity не заявляется.

| Проверка | Результат / evidence |
| --- | --- |
| YAML parsing | PASS: openapi, DATA-API, compose, VPS compose; duplicate keys запрещены |
| OpenAPI document schema | PASS, официальная OAS 3.1 schema `https://spec.openapis.org/oas/3.1/schema/2022-10-07` |
| Schema download SHA256 | `da01ba28852cac0de53893797cb8d1942bc3b05084f526dcc216717dec314ed0` |
| OpenAPI semantic validator | PASS (`openapi-spec-validator`) |
| Component JSON Schema / refs | PASS (AJV 2020 + formats) |
| DATA-API | PASS: 44 operations / 45 checks, coverage, role/auth/body/test data/negative, resolved schema refs и request fixtures |
| Env bidirectional parity | PASS: 25 canonical keys + 4 explicitly classified delivery keys |
| Typed config validation | PASS: compiled actual loadConfig, ephemeral required values только в памяти; test-only fields omitted |
| Example secrets | PASS: Bot/webhook/session/DB/test-signing values пустые |
| Dockerfile | PASS структуры: exact Node/npm, digest-pinned base, npm ci, multi-stage, non-root, readiness healthcheck |
| Compose | PASS структуры: три сервиса, readiness → migrate+seed → app, named volume, no public ports |
| Compose CLI | PASS: `docker compose config --quiet`; PASS combined `compose.vps.yaml`; ephemeral env, без запуска |
| CA | PASS структуры: exact host/container paths, read-only mount, NODE_EXTRA_CA_CERTS, create_host_path=false |
| .dockerignore | PASS: Git/dependencies/local env/private key files/build output исключены |
| Dependency manifests/lock | Сохранены без изменений; Node 24.21.0/npm 11.19.0 |
| Workspace structural build | PASS: contracts, domain, db+migrations, web; delivery API production tsconfig compile |
| Node script syntax | PASS: все delivery .mjs через `node --check` |
| Secret scan | PASS patterns текущих tracked/new text files и example checks; не full history/unknown token formats proof |
| Synthetic PNG | PASS: 64×64, PNG verify, SYNTHETIC metadata, 289 bytes |
| PNG SHA256 | `de25827e39ec87aac222d75d58ad788833e1b235b57360004251a062f02a1b64` |
| Presentation draft | PASS: 6 страниц, embedded Cyrillic font, text extraction, render/visual review всех страниц; technical first slide |
| Diff hygiene | `git diff --check` PASS; CRLF conversion warning не является diff error |
| Docker full build | DEFERRED: Docker CLI 29.4.1, desktop-linux pipe Engine отсутствует |
| Build ≤5 min | NOT_RUN; `measure-build.mjs` корректно сообщает DEFERRED при unavailable Engine |
| Final startup/persistence/live MAX | NOT_RUN; требует final TG-029 + Docker/VPS и реальные доступы |
| Final method/path/schema parity | NOT_VERIFIED; `check-registry.mjs` требует actual canonical TG-029 onRoute export |

Host Node `24.14.1`, npm `11.11.0`: `npm ci --engine-strict=false --ignore-scripts` использовался
только для доступной structural проверки с существующим lockfile. Это не exact toolchain proof и не
изменение закреплённых application versions. В Docker установлен и проверяется Node 24.21.0/npm 11.19.0.

Provenance ещё не merged contributions, использованных только для документации:

- Public API schema delta: `dd9aa19b4bc799c7fa2e3b5e4609d9cf4db9289c`,
  `packages/contracts/src/reads.ts`, `docs/05_INTERFACE_CONTRACTS.md`: create-options/candidates shapes.
- TG-014 intake route contribution: `7dcd40bfe0ddf1b039569594962f3559c5d083a3`,
  `apps/api/src/modules/cases/commands/intake-assignment/index.ts`: route names/multipart/lifecycle.
- TG-018 configuration contribution: `3b17883a158c447881f695cab1be0bbd03027b04`,
  `apps/api/src/modules/configuration/plugin.ts` / `service.ts`: paths/methods/success projections.

Это contributions **того же repository**, не прежних проектов. Они не cherry-pick'нуты в feature scope.
OpenAPI/DATA-API generated из merged exports базы, кроме двух явно PENDING_MERGE read-schema fallbacks.
Final синхронизация сверяет уже merged actual implementations/registry и может уточнить транспортные
схемы/негативные ответы, snapshot projection, StartDemoRun token и attachments representation.
Все submission placeholders и открытые gates перечислены в SUBMISSION_CHECKLIST/KNOWN_LIMITATIONS.
