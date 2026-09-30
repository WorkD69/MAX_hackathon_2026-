# Журнал проверки upload package

Application base: `332ac4aee174a8743324b82b38853b3a3751d2e9`.
FINAL_SUBMISSION_SHA проверенного source package: `4f719b0d9d2f40cee8ab16c61b86b40b63ca7d72`.
Upload cleanup поверх него меняет только документацию и PDF; его новый commit SHA и SHA-256 ZIP
передаются рядом с архивом. Самоссылка ZIP checksum или SHA собственного commit внутри него невозможна.

## Source и API

| Проверка | Evidence |
| --- | --- |
| Application code | `PASS`: `git diff --name-only` source commit против application base для `apps/**`, `packages/**`, manifests/lockfile и migrations — пусто; cleanup diff по тем же путям также пуст |
| OpenAPI | `PASS`: official OpenAPI 3.1 schema и semantic validator, exit 0 |
| DATA-API | `PASS`: 45 operations, 46 checks и JSON Schema fixtures |
| Route parity | `PASS`: runtime Fastify `onRoute` method/path 45/45; no stale routes |
| Env/config | `PASS`: 25 canonical + 5 delivery keys, typed config; secrets в `.env.example` пусты |

## Docker из clean checkout source commit

| Проверка | Evidence |
| --- | --- |
| Engine/Compose | Docker Engine 29.4.1, Compose 5.1.3; `docker compose config --quiet` — exit 0 |
| Build | `PASS`: `docker compose build --no-cache app` — 30.1 s, initial image pulls исключены; цель ≤300 s |
| Startup | `PASS`: `docker compose up --build -d` — exit 0; migrations и seed successful |
| Idempotent seed | `PASS`: повторный `migrate`, organization count и `created_at` до/после совпали |
| Web/API/readiness | `PASS`: `/` 200, `/health/live` 200, `/health/ready` 200 (`database=up`, `migrations=current`, `application=initialized`) |
| BUILD_SHA | `PASS`: `/api/v1/system/info.build_sha` = `4f719b0d9d2f40cee8ab16c61b86b40b63ca7d72` |
| PostgreSQL port | `PASS`: container `5432/tcp` имеет host binding `null` |
| Persistence | `PASS`: отдельная `submission_persistence_probe` сохранилась после `down`/`up --build`; readiness и BUILD_SHA повторно проверены |

Эта persistence probe подтверждает named DB volume. Case/history/attachment bytes и live MAX flow
проверяются отдельно пользователем на production; локальный Docker smoke не выдаётся за эту проверку.
Production до redeploy cleanup может возвращать application SHA `332ac4…`.

## Презентация и архив

| Проверка | Evidence |
| --- | --- |
| PDF | `PASS`: `Хакатон MAX — Умный город — Two pizza.pdf`, 13 страниц; первый слайд содержит полный source SHA, старого SHA и `[FINAL_*]` placeholders нет |
| Render | `PASS`: страница 1 визуально проверена; страницы 2–13 пиксельно совпадают с исходной PPTX после PowerPoint export при 72 DPI |
| ZIP | `PASS`: `Хакатон MAX — Умный город — Two pizza.zip`, 363 entries, PDF в корне, 0 запрещённых путей, CRC `testzip() = None`, размер около 1 MB (<50 MB) |
| Secret scan | `PASS`: Gitleaks v8.30.1 по распакованному ZIP, `no leaks found`, 0 secrets; итоговый SHA-256 фиксируется во внешнем отчёте |
| Remote | Source branch и tag `submission-final-2026-09-30` совпали с `4f719b0…`; cleanup commit проверяется после push |

Полный staged repository tree прежнего commit дал один false positive в неизменённом
`tests/support/postgres.mjs:18`: фиктивное имя test suite `TG012_POLICY`, не credential.
Предыдущий ZIP source package при отдельном Gitleaks scan показал 0 secrets. Скан upload ZIP
повторён после добавления PDF и обновления документации; после финального commit архив
пересобирается из HEAD и проверяется ещё раз.

Секреты, `.env`, Bot Token, webhook/session/initData, DB URL, chat ID и PII в evidence не сохранять.
