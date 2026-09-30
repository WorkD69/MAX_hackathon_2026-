# Журнал проверки финального submission candidate

Application base: `332ac4aee174a8743324b82b38853b3a3751d2e9`.
Ветка: `codex/final-submission-freeze`. Production с application SHA проходит отдельный
final smoke пользователя. Финальная проверка clean checkout итогового commit выполняется после commit.

## Структура и API

| Проверка | Результат / evidence |
| --- | --- |
| Application tree byte-for-byte против base SHA | `PASS`: `git diff --name-only HEAD -- apps packages package.json package-lock.json scripts/test tests` → пусто |
| `git diff --check` | `PASS`, exit 0 |
| Root manifest/lockfile, migrations, seed | `PASS`: файлы унаследованы без изменений от application base; Docker runtime мигрировал и выполнил seed |
| `.env.example` canonical parity и отсутствие рабочих значений | `PASS`: `validate.mjs`, 25 canonical + 5 delivery keys; отдельный secret scan ZIP ниже ещё требуется |
| Dockerfile, Compose topology, `.dockerignore` | `PASS`: structural validation и `docker compose config --quiet` |
| OpenAPI 3.1 schema/semantic validation | `PASS`: official OAS 3.1 schema + semantic validator, exit 0 |
| DATA-API schema/request fixtures | `PASS`: 45 operations, 46 checks, exit 0 |
| Actual runtime onRoute method/path parity | `PASS`: `check-registry.mjs`, 45/45; schema/auth/body сверены с canonical Zod и runtime declarations в generator/validators, live authenticated behavior отдельно |

## Docker из clean checkout

| Проверка | Результат / evidence |
| --- | --- |
| Docker Engine и `docker compose config --quiet` | `NOT_VERIFIED` |
| `docker compose up --build` | `NOT_VERIFIED` |
| Build time ≤300 s без первого pull | `NOT_VERIFIED` |
| Migrations и повторный idempotent seed | `NOT_VERIFIED` |
| Web/API/PostgreSQL/readiness | `NOT_VERIFIED` |
| PostgreSQL без host ports | `NOT_VERIFIED` |
| `build_sha` равен SHA clean checkout | `NOT_VERIFIED` |
| Case/history/attachment после `down`/`up` | `NOT_VERIFIED` |

Предварительный runtime прогон на рабочем candidate tree с `BUILD_SHA=332ac4…` (не clean checkout
финального commit): `docker compose build --no-cache app` — exit 0 за **30.2 s** после initial image
pull; `docker compose up --build -d` — exit 0; migrate/seed — success; `GET /` — 200,
`/health/live` — 200, `/health/ready` — 200 (`database=up`, `migrations=current`,
`application=initialized`), `/api/v1/system/info` — базовый SHA; PostgreSQL host ports — null.
Повторный `migrate` сохранил `organization` count и `created_at` (idempotency). Тестовая строка
`submission_persistence_probe` сохранилась после `docker compose down` / `up`; после старта app
readiness снова `ready`. Это доказывает сохранение DB volume в данном прогоне, но не является
проверкой Case/history/attachment из live MAX сценария.

Предварительный archive candidate из staged tree: 362 entries, запрещённых путей по checklist — 0.
Gitleaks v8.30.1 по распакованному candidate archive: exit 0, `no leaks found` (2.59 MB).
Скан полного staged repository tree дал один false positive в неизменённом
`tests/support/postgres.mjs:18`: фиктивный ключ `TG012_POLICY` — имя тестового набора,
не credential. Финальный ZIP и его checksum проверяются отдельно после commit.

## Сдача

| Проверка | Результат / evidence |
| --- | --- |
| Secret scan всего submission tree | `NOT_VERIFIED` |
| ZIP listing и SHA-256 | `NOT_VERIFIED` |
| Финальный PDF | `MISSING`: найденные локальные PDF содержат `[FINAL_*]` placeholders |
| Push, tag и remote SHA | `NOT_VERIFIED` |
| Live MAX web/mobile и Bot notification | `NOT_VERIFIED` в рамках этого журнала; smoke ведёт пользователь |

Предыдущий delivery baseline (`310d9caa7f6eeed2a575aa92692cda53f776d33e`,
источник `5045dd220b85bbd89038821aac110ec46c44a9d3`) сообщил PASS для 45 documented
operations и структурных проверок на **другом source SHA**. Эти результаты не переносятся
автоматически на application SHA выше. Финальную parity и Docker запуск нужно повторить.

При заполнении evidence указывать timestamp, полный commit SHA, точную команду и код возврата.
Не сохранять в журнале `.env`, Bot Token, webhook/session/initData, DB URL, chat ID или PII.
