# FINAL-DELIVERY — контракт задачи

`base_sha = 6b97fed7dd87cf7ed3281314d0a85a0b9e2f4328`.
Проверен с `git rev-parse HEAD` перед изменениями. Ветка `codex/final-delivery-package`.
Исходный checkout в System32 read-only по Windows ACL; работа выполняется в отдельном clone того же origin.

Цель: reviewable delivery/submission draft до TG-029 с повторяемой генерацией и честными gates.
Контекст: задание пользователя, AGENTS.md, Task Template, Product Freeze/Spec, Architecture §21,
Interface Contracts, Hackathon Criteria, текущие config/schema, package lock, модули API/seed.
Объём: Docker, env, API-документы, экспертный runbook, SYNTHETIC disclosure, checklist, draft PDF,
delivery validation scripts. Исключены feature implementation, architecture review, изменение правил продукта.
Зависимости: TG-014–018 route/schema contributions и final TG-029 registry; live MAX/VPS evidence.

Разрешены исключительно `Dockerfile`, `compose*.yaml`, `.dockerignore`, `.env.example`,
`openapi.yaml`, `DATA-API.yaml`, `README.md`, `docs/submission/**`, `scripts/delivery/**`.
Остальные файлы, особенно `apps/**`, `packages/**`, manifests/lockfile и нормативные документы, запрещены.
Критерии: три canonical сервиса, сохранение DB volume, отсутствуют рабочие секреты и публичные DB/app ports;
схемы и покрытие проверяются механически; draft не утверждает final route/runtime parity.
Команды: `node scripts/delivery/generate-api.mjs`, `node scripts/delivery/validate.mjs`,
`python scripts/delivery/validate-openapi.py`, `docker compose config --quiet`,
`docker compose build`, `git diff --check`; full Docker/live tests после final sync.
Эскалации: SPEC CONFLICT, неверный base, необходимость правки feature/config/manifest,
расхождение final registry/schema, отсутствие Docker Engine или обязательного live evidence.
Результат: файлы, fresh validation evidence, commit/push только delivery branch, полный SHA;
существующая human Git identity, без AI attribution, без push main.
