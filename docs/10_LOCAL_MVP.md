# Локальный MVP

Реализована единая композиция API и web: авторизация MAX, DemoRun, создание случая,
назначения, результаты и вложения, обратная связь, доработка, завершение, ролевые
чтения и настройки УК. Бизнес-команды используют PostgreSQL и общий command kernel.
Worker отправляет сохранённый NotificationIntent после commit.

## Воспроизводимый запуск

Нужны Node **24.21.0**, npm **11.19.0**, PostgreSQL **18.1**, OpenSSL и пустая
выделенная локальная база. Из корня репозитория:

```powershell
npm ci
npm run typecheck
npm run build
```

Создайте базу `rapid_manual_demo` в локальной PostgreSQL. Сертификат и ключ храните
за пределами Git; пример для OpenSSL:

```powershell
$demoTls=Join-Path $env:TEMP 'max-smart-city-tls'
New-Item -ItemType Directory -Force -Path $demoTls | Out-Null
Set-Content -LiteralPath "$demoTls/openssl.cnf" -Value '[req]' -Encoding ascii
openssl req -config "$demoTls/openssl.cnf" -x509 -newkey rsa:2048 -nodes -keyout "$demoTls/localhost.key" -out "$demoTls/localhost.crt" -days 30 -subj '/CN=localhost' -addext 'subjectAltName=DNS:localhost,IP:127.0.0.1'
$env:APP_ENV='test'
$env:TEST_AUTH_DEMO_PROFILE='TEST_DEMO_E2E_V1'
$env:DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/rapid_manual_demo'
$env:LOCAL_TLS_KEY="$demoTls/localhost.key"
$env:LOCAL_TLS_CERT="$demoTls/localhost.crt"
node scripts/demo/local.mjs
```

Launcher применяет миграции и дважды выполняет idempotent seed. Он запускает
**обычный** `apps/api/dist/app/main.js` на `127.0.0.1:4300` и TLS proxy на
`127.0.0.1:4301`. Откройте **https://localhost:4301/launch**. Локальный
self-signed сертификат потребует подтверждения в браузере или доверенного
локального сертификата. Порты можно изменить через `LOCAL_API_PORT` и
`LOCAL_DEMO_PORT`. Остановка — Ctrl+C; данные сохраняются в PostgreSQL.

`/launch` существует только в отдельном loopback launcher. Он выдаёт свежий
подписанный raw initData для вымышленной личности. Сам API не содержит endpoint
подписи или обхода авторизации. Ключ подписи и session secret генерируются при
запуске и не передаются в web. После перезапуска launcher откройте `/launch`
заново. Это изолированный `APP_ENV=test / MAX_ADAPTER_MODE=fake` профиль:
уведомления проходят настоящий durable worker, но доставка в реальный MAX здесь
не проверяется. Для live запуска нужен настоящий MAX launch и серверные secrets.

На подготовленном Windows-стенде PostgreSQL работает на `127.0.0.1:55439`, база
`rapid_manual_demo`, локальный администратор `rapid_admin`. Кластер сохранён в
`D:/CodexHome/tmp/rapid-final-mvp-pg/data`; localhost TLS-файлы лежат рядом с ним.

## Ручные сценарии

1. «Начать новый запуск» → «Житель» → «Создать обращение». Выберите адрес,
   категорию и опишите проблему.
2. «Сотрудник УК» → «Основной случай» → принять случай → выбрать подрядчика A
   → отправить назначение. Это три самостоятельных действия.
3. «Сотрудник подрядчика» → принять назначение → загрузить фотографию → описать
   работу → отправить результат. Загрузка материала сама не завершает работу.
4. «Житель» → скачать материал → подтвердить результат. Случай остаётся открытым.
5. «Сотрудник УК» → завершить случай. История и результат остаются доступны УК и жителю.
6. В новом запуске вместо подтверждения оставьте замечание. УК возвращает на
   доработку: появляется итерация 2 того же случая. Можно продолжить с A без
   нового принятия либо выбрать и отправить B. При выборе B доступ A отзывается;
   выбранный B получает случай после отправки назначения. Новый результат
   создаётся отдельно, первый сохраняется.
7. В новом запуске A отклоняет назначение с причиной. УК выбирает B и отправляет
   назначение; B принимает и выполняет работу.
8. «Начать новый запуск» создаёт новый DemoRun и новый основной случай; прежние
   записи сохраняются в БД. «Администратор УК» → «Настройки» открывает реальные
   настройки организации.

## Проверки

```powershell
$env:APP_ENV='test'
$env:TEST_DATABASE_TARGET='DISPOSABLE_TEST_ONLY'
$env:TEST_POSTGRES_ADMIN_URL='postgresql://ADMIN:PASSWORD@127.0.0.1:5432/postgres'
npm run test:owned-db
$env:LOCAL_BROWSER_CHANNEL='msedge' # либо chrome, если он установлен
node scripts/demo/browser-smoke.mjs
```

Owned runner создаёт отдельные disposable базы для legacy suites; основная
демо-база не используется тестами. API suites используют максимум два workers,
15 секунд на тест и 60 секунд на hooks для реальной PostgreSQL и очистки БД.
Browser smoke проходит happy path, скачивание,
доработку тем же A и A→B, отказ A→B, повторный запуск и страницу настроек через реальные
клики в viewport 390×844. `LOCAL_SMOKE_OUTPUT` задаёт внешний каталог JSON-отчёта
и screenshots; `LOCAL_DEMO_URL` — локальный HTTPS origin. Для desktop прогона
задайте `LOCAL_VIEWPORT_WIDTH=1440`.

`GET /health/ready` проверяет подключение и исполнение всех миграций;
`GET /api/v1/system/info` возвращает SHA запуска. Docker, публичный HTTPS,
submission OpenAPI/DATA-API и live MAX mobile/web validation — следующий этап.
