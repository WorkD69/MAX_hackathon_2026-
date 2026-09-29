# MAX-OPEN-APP-HOTFIX

## base_sha
`310d9caa7f6eeed2a575aa92692cda53f776d33e` — exact deployed baseline.

## Цель и контекст
Устранить HTTP 400 `proto.payload: Field 'webApp' cannot be null` при исходящем
приветствии `bot_started`. Официальный MAX SDK сериализует адрес кнопки `open_app`
в поле `web_app`. Источник: `max-messenger/max-bot-api-client-ts`,
`src/core/network/api/types/keyboard.ts`; подтверждение — controlled MAX request.
Canonical URL — configured `PUBLIC_APP_URL`, на VPS `https://157-22-231-21.sslip.io/`.

## Объём / разрешённые файлы
`apps/api/src/modules/max-adapter/real.ts`, соответствующий `real.test.ts`, этот контракт.
Commit/push отдельной ветки `codex/max-open-app-hotfix`; targeted tests, typecheck/build,
одна controlled отправка и deployment того же composition с новым image SHA.

## Исключения / запрещённые изменения
Product/TG015–TG029 semantics, frontend UX, schema/seed, webhook subscription,
Bot Token, organizer form, административный binding, judge-facing hardening.
Прежний baseline release/image сохраняется для rollback. Секреты только на VPS.

## Зависимости
Рабочий baseline, подтверждённый bot №793, existing real private chat, MAX CA.

## Приёмка и проверки
Transport JSON содержит `open_app` и configured URL в `web_app`, без secrets;
null/undefined/empty URL не отправляются. Targeted Vitest regression сначала RED,
затем GREEN; typecheck/build на Node 24.21.0/npm 11.19.0.
Controlled message `MAX Smart City готов к проверке` отправляется ровно один раз.
Docker/app/Caddy/HTTPS/webhook healthy, BUILD_SHA соответствует hotfix; PG data
preserved; ожидание пользовательского click до Mini App runtime smoke.

## Эскалация
Неверный identity, foreign subscription, rejected corrected payload, необходимость
менять product semantics или binding — STOP. Не подменять MAX evidence web HTTP 200.
