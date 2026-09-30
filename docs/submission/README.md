# Материалы финальной сдачи

Финальная презентация — [«Хакатон MAX — Умный город — Two pizza.pdf»](<../../Хакатон MAX — Умный город — Two pizza.pdf>).
PDF содержит 13 слайдов. На техническом первом слайде указаны Bot, Mini App, API, репозиторий,
маршрут проверки и полный SHA проверенного submission source commit:
`4f719b0d9d2f40cee8ab16c61b86b40b63ca7d72`.

Изменение презентации и документов оформляется отдельным documentation-only commit поверх указанного
source commit. Поэтому SHA cleanup commit отличается; его возвращают `git rev-parse HEAD` и итоговый
отчёт к ZIP. Application code остаётся исходным.

[Checklist](SUBMISSION_CHECKLIST.md), [runbook](VERIFICATION.md),
[известные ограничения](KNOWN_LIMITATIONS.md), [SYNTHETIC данные](SYNTHETIC_DATA.md) и
[журнал проверок](VALIDATION.md) входят в пакет. ZIP лежит вне репозитория и передаётся отдельно;
его SHA-256 приводится рядом с файлом, чтобы не создавать самоссылку внутри архива.
