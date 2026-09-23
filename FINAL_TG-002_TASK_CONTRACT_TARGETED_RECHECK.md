# TG-002 — targeted independent recheck

**STATUS:** `TG002_TARGETED_RECHECK_COMPLETE`
**TASK_ID:** `TG-002`
**BASE_SHA:** `200b117bd58f7080c15fba1cfa556d386a085c99`
**VERDICT:** `PASS`
**TG002-TCR-MAJ-001:** `CLOSED`
**TG002-TCR-MAJ-002:** `CLOSED`
**LOCAL_REGRESSION_FINDINGS:** `NONE`
**BLOCKER / MAJOR / MINOR:** `0 / 0 / 0`
**IMPLEMENTATION_CHOICES_REMAINING:** `0`
**SPEC_OR_ARCHITECTURE_GAPS:** `0`
**CODING:** `BLOCKED` до отдельного утверждения Task Contract.

## Граница проверки

Проверены только два findings из `C:\Users\Artem\TG-002_TASK_CONTRACT_REVIEW.md` и непосредственно затронутые sections обновлённого `C:\Users\Artem\TG-002_TASK_CONTRACT_CANDIDATE.md` и authoring report. Это не повторный полный 50-point review. Существующий checkout `C:\Users\Artem\max-hackathon-artem-tg002-contract` чист; `HEAD=origin/main=200b117bd58f7080c15fba1cfa556d386a085c99`. Canonical §6–7 прочитаны через `git show` из exact BASE_SHA. Файлы repository не менялись.

## TG002-TCR-MAJ-001 — CLOSED

Candidate §11.2, строка 160, теперь отдельно называет внутреннюю `CaseSnapshotProjectionSchema` и публичную `CaseSnapshotSchema`. Публичная HTTP schema — strict top-level `{case:CaseSnapshotProjectionSchema}`, где `case` обязателен. Role-specific public validators сохраняют wrapper и меняют только внутреннюю projection. Positive fixture принимает `{case:P}`, serialized snapshot явно содержит верхний `case`, negative fixture отвергает bare `P`; также запрещены missing/optional `case`, `{data:…}`, `{item:…}` и union bare/wrapped. Это совпадает с `docs/05_INTERFACE_CONTRACTS.md` §7, где `GET /api/v1/cases/{caseId}` возвращает `{ "case": { … } }`. Внутренний набор полей Case и role filtering исправлением не изменены.

## TG002-TCR-MAJ-002 — CLOSED

Candidate §11.2, строка 158, задаёт optional `limit` на HTTP wire как **string**, допустимую форму `^[1-9][0-9]*$`, затем перевод в `number` с обязательным `Number.isSafeInteger`. Parsed output — positive integer `1..Number.MAX_SAFE_INTEGER`; при отсутствии `limit` поле остаётся отсутствующим. Positive fixture `{limit:'50'}` ожидает `{limit:50}` и проверяет числовой integer type. Negative fixtures явно охватывают suffix, дробь, `Infinity`, `NaN`, ноль, отрицательное значение, знак `+`, ведущий ноль, exponent, пустую строку, whitespace, overflow и non-string input. `parseInt`/loose coercion запрещены. Это закрывает исходную неоднозначность между HTTP query string и parsed integer. Canonical `docs/05_INTERFACE_CONTRACTS.md` §6 задаёт optional `limit` и не задаёт min/max/default; заданный safe-integer диапазон является transport validation, default не вводится и продуктовую семантику не меняет.

## Локальная regression

В непосредственно затронутом §11.2 сохраняются Case list response, role-filtered Snapshot, activity и `allowed_actions` families. Разделы ownership/dependencies по-прежнему ограничивают запись 15 файлами внутри `packages/contracts/**`, оставляют единственной новой dependency exact `zod@4.6.5`, запрещают TG-002 менять root `package-lock.json` и назначают dependency checkpoint Integration Agent. Новый string-to-integer transform обслуживает формат HTTP query и не принимает business decision. Исправления не требуют нового Product/Architecture решения или иной implementation choice. `LOCAL_REGRESSION = 0`.

## Решение

`PASS` для targeted recheck. Следующий шаг — **CANONICAL TG-002 TASK CONTRACT CLOSURE**. Coding остаётся заблокированным до отдельного approval; этот recheck не запускает implementation, tests, commit или push.
