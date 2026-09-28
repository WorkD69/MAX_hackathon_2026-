# Checklist сдачи — FINAL_SYNC_REQUIRED = YES

Все пункты пока оставлены открытыми: наличие draft файла не равно принятому final gate.
Проверяющий указывает итоговый SHA, дату, ссылку на evidence и результат рядом с каждым пунктом.

- [ ] Рабочий Bot/MAX access; реальный путь из MAX
- [ ] Mini App HTTPS
- [ ] Public API HTTPS на время экспертной проверки
- [ ] Fixed Git SHA либо архив с checksum; после дедлайна submitted version неизменна
- [ ] Dependency manifest и root lockfile; Node 24.21.0 / npm 11.19.0
- [ ] README для независимого эксперта
- [ ] Dockerfile
- [ ] compose.yaml: postgres → migrate/seed → app, worker внутри app
- [ ] .dockerignore
- [ ] .env.example: canonical parity, пустые secret values
- [ ] One-command `docker compose up --build` из clean submitted checkout
- [ ] Build ≤ 5 min evidence; время первоначального base-image pull исключено, machine/cache указаны
- [ ] OpenAPI 3.1 schema/semantic validation и final route/schema/auth/body parity
- [ ] DATA-API validation, final method/path/roles/test fixtures/errors
- [ ] Тестовый доступ ко всем четырём ролям; новый DemoRun для эксперта
- [ ] SYNTHETIC disclosure во всех материалах, никаких real PII в fixtures
- [ ] Final presentation PDF вместо draft
- [ ] Первый слайд технический: Bot/Mini App/API access, repo/SHA, доступ и маршрут проверки
- [ ] Deployed `build_sha == submitted SHA`
- [ ] Решение оставлено online на весь период экспертной проверки

Дополнительные обязательные evidence gates этого продукта:

- [ ] Happy path до COMPLETED и same-Case rework N+1
- [ ] Initial contractor rejection → выбор другого → продолжение того же Case
- [ ] Same executor rework и A→B authority handoff
- [ ] Repeat DemoRun без reset старой истории
- [ ] Настоящее MAX notification после SubmitResult, без fake transport claim
- [ ] Web/mobile MAX launch и attachment download
- [ ] Readiness проверяет DB/migrations/runtime, а не только liveness
- [ ] `down` / `up` сохраняет Case/history/attachment в named volume
- [ ] CA mount read-only и TLS verification включена
- [ ] Secret scan текущих файлов и review final evidence без tokens/initData/chat IDs

Поля final sync:

| Поле | Значение |
| --- | --- |
| TG029_FINAL_SHA | `PLACEHOLDER_TG029_SHA` |
| SUBMISSION_SHA | `PLACEHOLDER_SUBMISSION_SHA` |
| EXPECTED_BUILD_SHA | `PLACEHOLDER_SUBMISSION_SHA` |
| BOT_LINK | `PLACEHOLDER_MAX_BOT_LINK` |
| MINI_APP_HTTPS | `PLACEHOLDER_MINI_APP_HTTPS` |
| API_HTTPS_ORIGIN | `https://api.example.invalid` |
| LIVE_EVIDENCE | `PENDING` |
| DOCKER_BUILD_SECONDS | `PENDING` |
| FINAL_ROUTE_PARITY | `NOT_VERIFIED` |
