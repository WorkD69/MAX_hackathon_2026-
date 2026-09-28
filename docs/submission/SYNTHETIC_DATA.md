# Тестовый доступ и SYNTHETIC данные

`DEMO_MODE=true`, `MAX_ADAPTER_MODE=live`. Эксперт открывает реальный Bot и Mini App в MAX,
проходит signed initData bootstrap и создаёт новый DemoRun. Ровно четыре роли доступны через demo switch;
backend выбирает actor по текущему run/assignment. Паролей synthetic actors нет.
Bot/session/webhook/DB secrets хранит команда вне репозитория; экспертный live путь не требует
получения этих server secrets. Raw initData и session token не публиковать в evidence.

Источник каталога: `packages/db/src/seed/index.ts`, версия `tg008.v1`, фиксированная дата каталога
`2026-01-01T00:00:00.000Z`. Marker организации: `[SYNTHETIC] Demo УК «Городская»`.
Ни один адрес, персонаж, подрядчик или описание проблемы не представляет реального клиента/организацию.

| Fixture | UUID |
| --- | --- |
| Организация | `d0080000-0000-4000-8000-000000000001` |
| Дом | `d0080000-0000-4000-8000-000000000002` |
| Помещение | `d0080000-0000-4000-8000-000000000003` |
| Resident | `d0080000-0000-4000-8000-000000000010` |
| UK Employee | `d0080000-0000-4000-8000-000000000011` |
| UK Admin | `d0080000-0000-4000-8000-000000000012` |
| Contractor A / employee | `d0080000-0000-4000-8000-000000000020` / `...0021` |
| Contractor B / employee | `d0080000-0000-4000-8000-000000000022` / `...0023` |
| Seed category A: сантехника | `d0080000-0000-4000-8000-000000000030` |
| Seed category B: электрика | `d0080000-0000-4000-8000-000000000031` |

Полные employee IDs: A `d0080000-0000-4000-8000-000000000021`,
B `d0080000-0000-4000-8000-000000000023`.
Статические ID — reference для сопоставления seed; выбирать параметры необходимо из актуальных
`create-options`, `contractor-candidates`, config и Case snapshot. Case/iteration/selection/assignment/
result/feedback/attachment IDs создаются во время сценария; фиксированных ID для них нет.

Основная отопительная категория не создана seed автоматически: UK Admin создаёт её перед сценарием:
`name=[SYNTHETIC] Отопление / стояк`, `description=Неаварийный demo`,
`default_contractor_id=<активный Contractor A из своего каталога>`,
`requires_premises_access=true`, `result_requirement=PHOTO`, `active=true`.
Если такой каталог уже подготовлен, используйте его текущий ID; не создавайте лишние записи повторно.

Тексты сценария помечать `[SYNTHETIC]`. Фото результата — сгенерированное тестовое изображение,
не фото квартиры/человека. Для repeatable API verification можно создать PNG без персональных данных:

```sh
node scripts/delivery/synthetic-file.mjs /absolute/path/synthetic-result.png
```

Метаданные PNG содержат marker `SYNTHETIC`; файл используется только как тестовый result material.
Это не доказательство реального ремонта. Не загружать паспорта, телефоны, лица, номера реальных квартир.
После API upload сохранить `attachment_id` из ответа, после SubmitResult сохранить `result_id`.

StartDemoRun не сбрасывает историю: новый run архивирует прежний, новый primary Case создаётся отдельным
CreateCase. Старый run не становится доступным через новый token. Maintenance recovery — team-only
CLI с отдельными ограничениями, не штатный способ повторения демо и не инструкция эксперту.

MAX identity эксперта — реальная identity, необходимая для bootstrap/доставки, и не часть synthetic seed.
Не публиковать real MAX ID, chat ID, initData или session token в Git/PDF/screenshots.
Автоматический `APP_ENV=test`/fake transport/test-signing profile — отдельное SYNTHETIC тестирование,
не замена live MAX проверке.
