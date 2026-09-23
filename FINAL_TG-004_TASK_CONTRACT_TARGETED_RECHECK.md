# TG-004 — targeted closure recheck

**STATUS:** `TG004_TARGETED_RECHECK_COMPLETE`
**TASK_ID:** `TG-004` (React/Vite Mini App skeleton)
**ASSIGNEE:** `EGOR`
**BASE_SHA:** `200b117bd58f7080c15fba1cfa556d386a085c99`
**VERDICT:** `PASS`
**F-1:** `CLOSED`
**F-2:** `CLOSED`
**F-3:** `CLOSED`
**F-4:** `CLOSED`
**BLOCKER / MAJOR / MINOR:** `0 / 0 / 0`
**LOCAL_REGRESSION_FINDINGS:** `NONE`
**ALLOWED_WRITE_PATHS:** `27`
**DEPENDENCIES_REQUIRED_NOW:** `9`
**ROOT_LOCKFILE_TASK_OWNED:** `NO`
**IMPLEMENTATION_CHOICES_REMAINING:** `0`
**SPEC_OR_ARCHITECTURE_GAPS:** `0`
**CODING:** `UNBLOCKED` после repository closure.

## Граница проверки

Это canonical closure recheck (не новый полный review / не redesign). Проверены findings F-1…F-4 предыдущего независимого review и непосредственно затронутые секции обновлённого candidate и authoring report. canonical источник остаётся `200b117bd58f7080c15fba1cfa556d386a085c99`; продвижение `origin/main` (`a9ac4636…` или новее) не является baseline failure и implementation baseline не сдвигает.

## F-1 — CLOSED — CSS import Vite ambient typing

`apps/web/src/vite-env.d.ts` входит в create-set контракта (§ 7 CREATE #27, § 11.15) с exact-содержимым `` /// <reference types="vite/client" /> ``; `ALLOWED_WRITE_PATHS = 27`; `$allowed` (§ 16.2) и `git add` (§ 16.9) содержат 27 путей; AC-001/§ 20/§ 13 рисуют 27 paths (2 modify, 2 delete, 23 create). Покрывает TS2307 для `import './styles/base.css'` при frozen `tsconfig.base.json` (`types: []`) и `moduleResolution: Bundler`. Stale-count `26 paths` в нормативном теле отсутствует.

## F-2 — CLOSED — невалидный CSS `100%dvh`

§ 11.12 задаёт `html,body,#root{margin:0;min-height:100dvh}`; литерала `100%dvh` в candidate нет; AC-012 проверяемо по реальному файлу (`100dvh` — корректная `<length>` единица, `@media (min-width:768px)` сохранён).

## F-3 — CLOSED — упорядочивание lockfile / scope pre-check

§ 16 исполняем линейно: § 16.2 scope/write-set pre-check (`$allowed`=27, `$outside`, fail-closed) выполняется ДО disposable lockfile regeneration; § 16.3 `npm install --package-lock-only --ignore-scripts` → hash-check → `npm ci` → `npm ls` → `git restore -- package-lock.json` → `LOCKFILE_RESTORED_AFTER_DEPENDENCY_VERIFICATION`; § 16.8 идемпотентный final proof до staging § 16.9; § 16.9 `git add`/staged-validate не включает `package-lock.json`. `ROOT_LOCKFILE_TASK_OWNED = NO` (§ 12.8); коммит root lockfile запрещён (§ 8, AC-013); каноническую перегенерацию выполняет только Integration Agent на IC-1 (§ 12.6).

## F-4 — CLOSED — readonly `window.innerWidth`

§ 11.14 фиксирует установку ширины исключительно через `Object.defineProperty(window, 'innerWidth', { value, configurable: true })` (375 и 1024) ДО render; явно запрещено прямое присвоение readonly-свойства; negative check § 17 дублирует механику. Типизируется без TS2540.

## Локальная regression

Проверены только последствия F-1…F-4: count `27` единообразен во всех relevant sections (§ 7, § 13, AC-001, § 16.2, § 16.9, § 20, отчёт § 1/§ 7/§ 9); 27-й файл остаётся внутри `apps/web` и вне `src/features/**`, root frozen surface и `packages/*`; dependency count остаётся `9`; `package-lock.json` отсутствует в staged set; verification order исполним линейно. `LOCAL_REGRESSION_FINDINGS = NONE`, новых findings нет.

## Решение

`PASS` для targeted closure recheck. F-1..F-4 CLOSED; `BLOCKER / MAJOR / MINOR = 0 / 0 / 0`; `IMPLEMENTATION_CHOICES_REMAINING = 0`; `SPEC_OR_ARCHITECTURE_GAPS = 0`. Канонический контракт утверждён; coding TG-004 разблокирован. Implementation branch создаётся позже от неизменного `BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99`, а не от closure SHA.