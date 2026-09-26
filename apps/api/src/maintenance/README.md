# TG-008: team-only recovery

После `npm run build --workspace @max-smart-city/api` команда запускается из CLI с `DATABASE_URL`, `APP_ENV=development|test`, `DEMO_MODE=true` и `TARGET_ORGANIZATION_ID=d0080000-0000-4000-8000-000000000001`:

```powershell
node apps/api/dist/maintenance/cli.js
```

У команды нет HTTP route или учётных данных в репозитории. Доступ к ней определяется доступом команды к shell/hosting command и БД. Она пишет warning с target и исходом. Перед изменением проверяет synthetic marker и все связи. При наличии Case, DemoRun, MAX identity, истории/audit или смешанных связей отказывает и не удаляет их. Успешное действие атомарно пересоздаёт только каталог TG-008 с прежними ключами/UUID; migrations не затрагивает. Обычный повтор демо выполняется командами TG-013, а не recovery.
