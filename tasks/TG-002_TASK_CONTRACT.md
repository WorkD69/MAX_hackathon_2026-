# TG-002 TASK CONTRACT

```text
TASK_ID = TG-002
ASSIGNEE = ARTEM
BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99
TASK_CONTRACT_STATUS = APPROVED
TASK_CONTRACT_GATE = PASS
CODING = UNBLOCKED AFTER REPOSITORY CLOSURE
```

## 1. Назначение и приоритет

Цель: выразить утверждённые shared HTTP/Zod request, response, error, session, snapshot и command wire contracts в `@max-smart-city/contracts`, без изменения продуктовой семантики. Задача LANE-D, execution class A, зависит непосредственно от TG-001; выполняется параллельно с TG-003/004/005; разблокирует TG-009/010/012/020/031. Основание: `tasks/TASK_GRAPH.md` §3 TG-002, §§6–7. Иерархия: официальные требования → Product Freeze → Product Spec → Architecture → Data Model → Interface Contracts → ADR → Task Graph → этот контракт. При расхождении нижний уровень не переопределяет верхний.

Этот документ — утверждённый canonical Task Contract. Independent review и targeted recheck завершены со статусом `PASS`; root lockfile остаётся обязанностью Integration Agent на Wave-1 checkpoint.

## 2. Preconditions и Git safety для будущего coding-agent

Перед началом: `git status --short`, `git rev-parse HEAD`, `git branch --show-current`; implementation branch должна быть создана ровно от `BASE_SHA = 200b117bd58f7080c15fba1cfa556d386a085c99`, дерево чистое; TG-001 и IC-0 PASS; этот Task Contract APPROVED. После repository closure `origin/main` содержит closure commit и не обязан равняться `BASE_SHA`; coding-agent проверяет доступность exact `BASE_SHA` и равенство HEAD этой базе, не сдвигая implementation baseline. Неподходящий checkout/грязное дерево/другая база → остановка без reset/clean/permission changes. Implementation branch: `codex/tg-002-shared-http-zod-contracts`, создавать только после repository closure. Не смешивать с другими задачами.

## 3. Ownership и допустимая запись

Canonical module scope — строго `packages/contracts/**`. **15 точных разрешённых файлов** будущей реализации:

1. `packages/contracts/package.json`
2. `packages/contracts/tsconfig.json`
3. `packages/contracts/tsconfig.contract-tests.json`
4. `packages/contracts/src/index.ts`
5. `packages/contracts/src/index.test.ts`
6. `packages/contracts/src/primitives.ts`
7. `packages/contracts/src/session.ts`
8. `packages/contracts/src/errors.ts`
9. `packages/contracts/src/reads.ts`
10. `packages/contracts/src/commands.ts`
11. `packages/contracts/src/configuration.ts`
12. `packages/contracts/src/demo.ts`
13. `packages/contracts/src/attachments.ts`
14. `packages/contracts/src/max.ts`
15. `packages/contracts/src/type-exhaustiveness.ts`

Исключительно TG-002 принадлежит весь `packages/contracts/**`; изменение иных файлов, в том числе `.gitignore`, запрещено. **Shared writable files у TG-002: 0.** `package.json` в корне, `package-lock.json`, `tsconfig.base.json`, `apps/api/**`, `apps/web/**`, `packages/db/**`, `packages/domain/**`, `tests/**`, `docs/**`, `tasks/**`, `README.md`, deployment files запрещены. Root lockfile необходим для добавления Zod, но по Task Graph §7 принадлежит Integration Agent на checkpoint; TG-002 не получает права его менять. Файлы TG-003/004/005 не открываются на запись. Общий import surface — `@max-smart-city/contracts` через существующий package root export; API/web импортируют отсюда, не из внутренних файлов. Позднее изменение exported schemas после Wave 1 — согласованный contract change через Integration Agent (§7), не ad hoc правка.

`COLLISION_RISK`: высокий на root lockfile и косвенный на backend/frontend imports; внутри `packages/contracts` эксклюзивный owner. `COLLISION_PROTOCOL`: по Task Graph §§3/7, root dependency additions пакетирует Integration Agent, root manifests frozen после TG-001; независимые branches TG-003/004/005 не редактируют `packages/contracts`. Отдельная координационная политика здесь не вводится.

## 4. Зависимости и package/export boundary

Непосредственная новая runtime dependency TG-002 — **одна**: `zod` exact `4.6.5` в `packages/contracts/package.json` (`dependencies`, без `^`, `~`, `latest`, `*`, диапазонов). На 22.09.2026 npm registry `dist-tags.latest=4.6.5`, package metadata `version=4.6.5`, integrity `sha512-v5l/aFXZQeai4awLbOpSoHecE9UiMrnfx75tEXLjNonXVARxQ5mOeipTjROUchszUNCqnE+hqAMujRsRHsut2Q==`; Zod 4 документирован как stable, TS ≥5.5, Node/modern browsers, strict TS. В baseline TypeScript `7.0.2`, `strict=true`, `NodeNext`, Node `24.21.0`, npm `11.19.0`. Других dependency additions TG-002 не делает; versions TG-003/004/005 не pin'ит.

Публичный package export остаётся только `.` с `types=./dist/index.d.ts`, `import=./dist/index.js`; `files=["dist"]`, ESM. `src/index.ts` — единственный public barrel для явно именованных Zod schemas, inferred `z.input`/`z.output` types и wire constants. Deep imports и export внутренних тестовых/DB/runtime файлов запрещены. Не экспортировать Fastify handlers, fetch client, business transitions, DB row types, auth verifier или MAX transport adapter.

Manifest scripts `build`/`typecheck` остаются TG-001 baseline. `test` становится точно `tsc -p tsconfig.contract-tests.json --noEmit && vitest run src/index.test.ts`. `tsconfig.contract-tests.json` extends `./tsconfig.json`, задаёт `compilerOptions:{noEmit:true,tsBuildInfoFile:"dist/.contract-tests.tsbuildinfo"}`, `include:["src/**/*.ts"]`, `exclude:["dist","node_modules"]`; inherited `composite:true` сохраняется, поэтому все imported source files включены. Production `tsconfig.json` продолжает собирать public barrel и его imports без включения tests в `dist`. Это даёт реальную compile проверку enum exhaustiveness, а не только transpile Vitest.

Текущий lockfile не содержит Zod. TG-002 записывает exact `"zod": "4.6.5"` только в workspace manifest. На своей ветке запускает task-local install без записи/чтения root lockfile (§7) и проверяет фактически установленную версию. После merge Wave-1 веток отдельный Integration Agent по Task Graph §7 пакетирует dependency additions в root `package-lock.json`, проверяет `npm ci` и полные workspace gates. Lockfile checkpoint не входит в TG-002 diff/commit и не меняет его `BASE_SHA`.

## 5. Wire semantics, schema responsibilities

Все JSON UUID — строки UUID; timestamps — RFC 3339 UTC strings; `null` сохраняется там, где канонический payload явно задаёт nullable field. JSON requests/responses не используют `Date`, `bigint`, DB enum objects, `undefined` в wire. `multipart/form-data` представлен отдельной Zod schema для JSON part `payload` и отдельной транспортной границей бинарных `files`; bytes, MIME/size checks и SHA-256 fingerprint не считаются JSON schema transforms. Contract layer проверяет структуру и локальное содержимое, не решает authorization/currentness/state/first-valid-wins, не генерирует права и не меняет business state. `revision` — diagnostic/freshness, не обязательный CAS target.

Закрытые public unions: `CaseState` = `CREATED | ACCEPTED_BY_UK | SENT_TO_CONTRACTOR | EXECUTION | AWAITING_RESULT_CHECK | REMARKS_REVIEW | REWORK | COMPLETED`; `Role` = `RESIDENT | UK_EMPLOYEE | UK_ADMIN | CONTRACTOR_EMPLOYEE`. Поддерживающие wire enums только в местах фактического payload: `ResultRequirement=NONE|PHOTO|FILE`, `AssignmentDecision=PENDING|ACCEPTED|REJECTED`, `ResidentFeedbackType=CONFIRMATION|REMARK`, `DemoRunStatus=ACTIVE|ARCHIVED`, `MaxIdentityLinkStatus=UNLINKED|LINKED_CONFIRMED`; технические DB-only status enums не выдавать публично без соответствующего поля wire payload. Не вводить девятое state/пятую role.

Нормативная матрица семейств для schemas и тестов:

| Семейство | Источник | Обязательная граница |
| --- | --- | --- |
| Common wire | Interface Contracts §§1, 4–5, 31–32 | `request_id`, `Idempotency-Key` как header contracts; success `command_id/case_id/state/revision/created/event_ids`; error `error.code/message/request_id`, optional case/current revision/safe details; closed stable semantic codes §4.1; HTTP 400/401/403/404/409/422/500/optional 503 не подменять schema validation logic. |
| Auth/session | §§2–3 | raw `init_data` request; bootstrap token/context response, nullable demo and actor IDs; `GET /session` current context; actor switch body только `role_view`, response new token/context. Валидация подписи/свежести и token creation — TG-010. |
| Case reads | §§6–9, 30 | list query optional `state/limit/cursor` и list item/next cursor; Case snapshot nested current iteration, selection, assignment, executor, result, feedback, initial attachments, activity, allowed_actions; role-filtered variants и omission of forbidden fields; activity keyed by event ID/seq, один item на fact; allowed action current target IDs и input hints. Разрешения генерирует backend TG-017. |
| Case commands | §§10–23, 32 | `CreateCase` multipart JSON payload/files; accept; select-contractor; send-assignment; accept/reject-assignment; result-material multipart; submit-result; resident-confirmation; resident-remark multipart; request-clarification JSON/multipart; record-no-resident-feedback; return-to-rework; complete with two discriminated bases; complete-with-explanation; add-comment multipart. Exact target IDs из каждого раздела обязательны; `client_revision` для accept optional; `ReturnToRework`/clarification не добавляют client-selected iteration; `SubmitResult` response содержит queued notification; EVT-015 response содержит `no_feedback_event_id`. |
| Configuration | §24 | пять read endpoints; patch organization; create/patch house; create/patch category; create contractor; put contractor binding; put existing user role binding; put contractor employee binding. Только whitelist body fields; никакой client organization selector, AppUser creation или Case PATCH. DB validation/audit — TG-018. |
| Demo | §§3.3, 25 | start run `scenario_key`, response `demo_run_id/status/primary_case_id/role_views`, exactly four views; actor switch role view only. Actor resolution/active-run security — TG-013. |
| Attachments/download | §§10, 15A, 18–19, 23, 26 | JSON payload of multipart commands; attachment metadata in reads; download-capability response `download_url/file_name/expires_at`; opaque URL as string; binary direct stream excluded from JSON schema. Capability minting/access — backend owner. |
| MAX/notifications | §§2, 16, 27–28 | bootstrap raw initData as above; webhook transport boundary only where canonical payload exists; queued notification in submit-result success. HMAC, webhook secret verification, Bot API, outbox/worker не входят в TG-002. |
| Diagnostics | §1.4 | `/api/v1/system/info` response: public `build_sha` only, no env/secrets. Endpoint implementation — TG-003. |

Каждый payload из Interface Contracts должен иметь позитивный и негативный fixture, JSON serialization roundtrip/snapshot; package-inferred TS types должны компилироваться. Для `selected ≠ sent ≠ accepted`, resident confirmation/no-feedback/Result does not close, old contractor access и role filtering schemas только кодируют wire, не реализуют policy. `allowed_actions` не становится authorization token.

## 6. Acceptance и отрицательные проверки

1. `@max-smart-city/contracts` собирается ESM/`.d.ts`; API и web могут импортировать только package root; exported names стабильны и проходят TypeScript compiler.
2. Позитивные/негативные fixtures и serialized snapshots покрывают все перечисленные семьи; type exhaustiveness test отвергает 9-е state/5-ю role; rejects missing exact selection/assignment/result/feedback/iteration IDs там, где они канонически обязательны, запрещённые client authority fields и generic state patch.
3. Ошибки по умолчанию не пропускают произвольные `details`, secrets или fields из чужого контекста; response schema не создаёт скрытый канал через CSS/client filtering.
4. `revision` не стал обязательным CAS; multipart file bytes не проходят JSON schema; validation не изменяет и не создаёт business facts.
5. Diff ограничен §3; новых API endpoints, Fastify routes, React screens, DB types/migrations, state machine, MAX adapter/auth verification, notification worker нет.
6. На TG-002 branch dependency exact в workspace manifest и установленном `node_modules/zod`; root lockfile byte-for-byte равен BASE_SHA. После Wave-1 checkpoint Integration Agent проверяет exact lock entry и clean `npm ci`. Это два разных gates.

## 7. Исполняемые команды проверки (для будущего approved coding branch)

PowerShell, из корня будущей approved TG-002 branch; только Node/npm baseline и pinned workspace scripts. До команд установить именно Node `24.21.0` и npm `11.19.0`, как требует TG-001. `npm ci` здесь **не применяется**: workspace manifest уже содержит Zod, а root lockfile обновит Integration Agent позже. Task-local install использует официальный npm mode `--no-save --package-lock=false`: не записывает manifest/lockfile и не читает устаревший lock; `--ignore-scripts` исключает side effects install scripts. Он проверяет TG-002, но не доказывает reproducible clean install всей Wave 1.

```powershell
$base = '200b117bd58f7080c15fba1cfa556d386a085c99'
if ((node --version).Trim() -ne 'v24.21.0') { throw 'Node baseline mismatch' }
if ((npm --version).Trim() -ne '11.19.0') { throw 'npm baseline mismatch' }
if ((git merge-base HEAD $base).Trim() -ne $base) { throw 'BASE_SHA mismatch' }
git status --short
git diff --check $base
git diff --exit-code $base -- package.json package-lock.json tsconfig.base.json
if ($LASTEXITCODE -ne 0) { throw 'Root manifest/lock/config changed' }
$allowed = @('packages/contracts/package.json','packages/contracts/tsconfig.json','packages/contracts/tsconfig.contract-tests.json','packages/contracts/src/index.ts','packages/contracts/src/index.test.ts','packages/contracts/src/primitives.ts','packages/contracts/src/session.ts','packages/contracts/src/errors.ts','packages/contracts/src/reads.ts','packages/contracts/src/commands.ts','packages/contracts/src/configuration.ts','packages/contracts/src/demo.ts','packages/contracts/src/attachments.ts','packages/contracts/src/max.ts','packages/contracts/src/type-exhaustiveness.ts')
$changed = @(git diff --name-only $base) + @(git ls-files --others --exclude-standard)
$outside = @($changed | Where-Object { $_ -notin $allowed })
if ($outside.Count -gt 0) { throw "Forbidden paths: $($outside -join ', ')" }
node -e "const p=require('./packages/contracts/package.json'); if(p.dependencies?.zod!=='4.6.5')process.exit(1); if(Object.keys(p.exports).join()!=='.')process.exit(1); if(p.exports['.'].import!=='./dist/index.js'||p.exports['.'].types!=='./dist/index.d.ts')process.exit(1)"
npm install --no-save --package-lock=false --ignore-scripts --include=dev
if ($LASTEXITCODE -ne 0) { throw 'Task-local install failed' }
node -e "const p=require(require.resolve('zod/package.json',{paths:['./packages/contracts']})); if(p.version!=='4.6.5')process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw 'Installed Zod version mismatch' }
npm run typecheck -w @max-smart-city/contracts
if ($LASTEXITCODE -ne 0) { throw 'TG-002 typecheck failed' }
npm run build -w @max-smart-city/contracts
if ($LASTEXITCODE -ne 0) { throw 'TG-002 build failed' }
npm run test -w @max-smart-city/contracts
if ($LASTEXITCODE -ne 0) { throw 'TG-002 tests failed' }
node -e "import('@max-smart-city/contracts').then(x=>{if(!x.CaseStateSchema||!x.RoleSchema)process.exit(1)})"
if ($LASTEXITCODE -ne 0) { throw 'Public package export failed' }
git diff --exit-code $base -- package-lock.json
if ($LASTEXITCODE -ne 0) { throw 'Root lockfile changed' }
git diff --check $base
git status --short
```

`git status --short` до commit показывает только §3; после commit — пуст. `node_modules/`, `dist/`, `*.tsbuildinfo` уже игнорируются TG-001 `.gitignore`; их удаление не требуется для clean Git worktree. Если npm неожиданно создал tracked/untracked файл вне whitelist, остановиться и показать diff, не удалять неизвестные изменения. `test` должен включать `tsc -p tsconfig.contract-tests.json --noEmit` и Vitest fixtures; build/typecheck используют существующие workspace scripts. Source-only negative scan PowerShell: `$src = Get-ChildItem packages/contracts/src -Filter '*.ts' | Where-Object { $_.Name -notlike '*.test.ts' }; $hits = $src | Select-String -Pattern 'Fastify|React|Kysely|process\.env|fetch\('; if ($hits) { $hits; throw 'Scope leakage' }`. Текстовые fixtures и документация анализируются отдельно, без ложного fail по цитате. Доказательства DB/API/E2E/MAX остаются будущим owners.

На Wave-1 checkpoint **только Integration Agent** объединяет approved ветки, выполняет `npm install --package-lock-only --ignore-scripts`, проверяет root lock entry `packages['packages/contracts'].dependencies.zod === '4.6.5'` и `packages['node_modules/zod'].version === '4.6.5'`, затем `npm ci`, `npm run typecheck --workspaces`, `npm run build --workspaces`, `npm run test --workspaces` и фиксирует новый stable `main`. TG-002 не выполняет эту write-команду и не заявляет clean-install PASS на своей ветке.

## 8. Commit/push и Definition of Done

Coding-agent сверяет BASE_SHA и чистое дерево, работает в branch §2, изменяет только §3, показывает diff и task-local результаты §7, сохраняет человеческую Git identity, делает один осмысленный commit и push в `origin`, возвращает полный commit SHA и status push. Root lock update делает только назначенный Integration Agent по Task Graph; TG-002 не присваивает себе его commit. Task DoD: §6 и task-local gate §7 проходят, нет blocker, есть commit SHA/push. Wave-1 DoD отдельно включает lockfile/clean-install gate Integration Agent.

## 9. Traceability и architecture-decision leakage

`CaseState/Role` → Data Model §§1.3–1.5, Product Spec INV-003/042/043; exact targets и commands → Interface Contracts §§10–23, Product Spec INV-007/021/044/045; common envelopes/read/activity → Interface Contracts §§4–9/30–32, Product Spec INV-002/005/029; config → §24, INV-037–041; demo/session/MAX → §§2–3/25/27–28, INV-043/046/047; attachments → §26; package ownership/dependencies/collision → Task Graph §§3/6–7. TG-002 не выбирает concurrency protocol, auth cryptography, MAX transport, config loader, DB schema, UI flow, business policy или deployment. Если схема требует такого выбора, эскалация, не локальный workaround.

## 10. Targeted blocker closure

- **B-1 закрыт:** §4/§7 разделяют task-local install без lockfile и Integration Agent checkpoint, как уже предписывает Task Graph §7. Coding-agent не получает root ownership.
- **B-2 закрыт:** конкретные wire representations, включая session read, пять configuration reads, role snapshots/action targets и command success, зафиксированы в §11. Это DTO только из канонических сущностей/полей, без новых business fields.
- **B-3 закрыт:** TG-002 валидирует documented MAX auth request, webhook header boundary и capability JSON. MAX update body остаётся opaque external payload; parser/secret equality/200 response принадлежат TG-019 по Task Graph §3 TG-019 и Interface Contracts §27. Бинарный stream §26.2 не является JSON response.
- **B-4 закрыт как вопрос исполнимости:** §7 — PowerShell procedure на pinned TG-001 runtime, с fail-fast version check. Authoring host имеет старые Node/npm, поэтому здесь не объявляется, что build/tests уже прошли. После approval coding-agent выполняет gate на требуемых версиях.

`SPEC CONFLICT`, baseline mismatch, необходимость расширить allowed files, изменить approved product/API semantics или нарушение чужой ownership → остановиться; сообщить конкретный source/расхождение владельцу и Integration Agent. Изменение Freeze/Spec только по явному решению команды с записью в `docs/07_DECISIONS.md`.

## 11. Полный source-to-schema mapping для TG-002

Обозначения для точной Zod representation: `U` = `z.uuid()` string; `T` = RFC 3339 UTC string; `S` = string (непустой там, где это явно требуется); `B` = boolean; `I` = safe JSON integer; `X?` = поле можно опустить; `X|null` = поле присутствует и может быть `null`. Объекты задаются Zod 4 `z.strictObject`: неизвестные поля не принимаются, а не молча удаляются. `Date`, DB `bigint`, `undefined`, client-provided actor/tenant и schema transforms для принятия business decisions запрещены. Для list/state/revision/event_seq/byte_size чисел — `z.int().min(0)` либо `z.int().min(1)` согласно полю; `z.int()` уже ограничен safe integer диапазоном. `z.input` и `z.output` экспортируются вместе со schema. Ни один `S` без нормативного словаря не превращается в выдуманный closed enum.

### 11.1. Общие и ранее оспаривавшиеся schemas

| Public schema / wire | Точные поля и Zod representation | Canonical source | Positive / negative fixture |
| --- | --- | --- | --- |
| `CaseStateSchema`, `RoleSchema`, support enums | 8/4 literal union из §5; `ResultRequirement`, `AssignmentDecision`, `ResidentFeedbackType`, `DemoRunStatus`, `MaxIdentityLinkStatus` только в соответствующих DTO. `NotificationStatus` DB-only; `QUEUED` — отдельный literal response. | Data Model §§1.3–1.5; Product Spec §§4–6/23 | 8/4 values pass; ninth state/fifth role fail; `QUEUED` не становится Case state. |
| `AuthMaxRequestSchema` | strict `{init_data:S}`; raw signed string, не `initDataUnsafe`. | Interface §§2.1, 1.2 | raw string pass; missing/`initDataUnsafe` fail. Signature/freshness — TG-010. |
| `SessionContextSchema` | strict `{real_max_identity:{max_identity_id:U,display_name:S,outbound_max_ready:B},demo_mode:B,demo_run_id:U|null,primary_case_id:U|null,effective_actor:{app_user_id:U|null,role:Role|null,display_name:S}}`. | Interface §2.1 success, §§2.2–2.4; Data Model §§6.1–6.5/35 | exact context with nullable IDs pass; Bot Token/`chat_id`/client contractor alias fail. |
| `AuthMaxSuccessSchema`, `SessionReadResponseSchema`, `ActorSwitchSuccessSchema` | bootstrap/switch: strict `{session_token:S,expires_at:T,session:SessionContext}`. Session read: **direct `SessionContext`**, поскольку §2.4 обещает current context без нового token; никаких token/secret полей. | Interface §§2.1, 2.4, 3.3 | bootstrap and direct read pass; `GET /session` с token/secret или switch без нового token fail. |
| `ActorSwitchRequestSchema` | strict `{role_view:Role}`; ровно четыре views, без `role`, `actor_alias`, `contractor_id`. | Interface §§3.2–3.3/25.4 | contractor role pass; alias/fifth role fail. |
| `ErrorResponseSchema`, `SemanticErrorCodeSchema` | strict `{error:{code:stable code,message:S,request_id:U,case_id?:U,current_revision?:I,details?:{target_assignment_id:U}}}`. `details` допустим только в документированном примере `STALE_ASSIGNMENT`; прочие коды не получают произвольный object. Codes: §4.1 плюс route-specific `INVALID_INIT_DATA_FORMAT`, `MAX_INIT_DATA_INVALID_SIGNATURE`, `MAX_INIT_DATA_EXPIRED`, `APP_USER_NOT_MAPPED`, `AUTH_BOOTSTRAP_FAILED`, `DEMO_MODE_DISABLED`. | Interface §§2.1, 3.3, 4, 31 | stale example pass; arbitrary details/secret/unknown code fail. |
| `CommandSuccessSchema` | strict `{command_id:U,case_id:U,state:CaseState,revision:I,created:strict command-specific object,event_ids:U[]}`; `notification?:{status:'QUEUED'}` только SubmitResult; `no_feedback_event_id?:U` только EVT-015 response. Empty `created:{}` when command creates no returned entity. | Interface §§10–23, 32; Data Model §§9–17/19 | CreateCase and SubmitResult examples pass; full snapshot as command response or fake DELIVERED fail. |
| `WebhookHeadersSchema`, `WebhookOpaqueBodySchema`, `WebhookAckSchema` | normalized header `{x-max-bot-api-secret:S}`; body `z.unknown()` как внешние MAX bytes/object до TG-019 parser; ack — HTTP 200 **без обязательного JSON payload** (`z.void()` для application JSON absence). Schema не сравнивает secret. | Interface §§1.1, 27.2; Architecture §7.2; Task Graph TG-019 | present header + opaque body pass; missing/empty header fail; wrong secret отвергает TG-019 runtime test. Не придумывать event fields. |
| `AttachmentPathSchema`, `AttachmentMetadataSchema`, `DownloadCapabilityResponseSchema` | path `{attachmentId:U}`; metadata `{attachment_id:U,file_name:S,mime_type:S,byte_size:I}`; capability strict `{download_url:HTTPS URL string,file_name:S,expires_at:T}`. `GET /attachments/{id}` body — binary stream, не JSON schema. | Interface §§7/26; Data Model §16 | exact metadata/capability pass; `href`, raw storage URL, missing expiry fail; binary bytes проверяет TG-015/027. |
| `NotificationQueuedSchema` | strict `{status:'QUEUED'}` внутри SubmitResult success; DB `NotificationIntent`/outbox status не публикуется как дополнительное HTTP response. | Interface §§16/28; Data Model §19 | `QUEUED` pass, `DELIVERED` at SubmitResult fail. |

### 11.2. Reads, activity и `allowed_actions`

`CaseListQuerySchema` описывает strict query object с optional `state:CaseState`, `limit`, `cursor:S`; `limit` **на HTTP wire всегда string**, а не JSON number. Его входная форма — только ASCII decimal без знака и ведущих нулей: `^[1-9][0-9]*$`. После проверки формы преобразовать строку в `number` и принять только `Number.isSafeInteger(value)`; parsed output `limit` — положительный integer `1..Number.MAX_SAFE_INTEGER`. Нуль и отрицательные значения отклоняются; если параметр отсутствует, parsed output не содержит `limit`, default в TG-002 не задаётся. Граница safe integer — bounded transport parameter Task Contract author, а не продуктовый pagination limit; отдельного canonical min/max/default Interface §6 не задаёт. Не применять loose coercion/`parseInt` к сырой строке. Positive query fixture `{limit:'50'}` → parsed `{limit:50}` и `typeof parsed.limit === 'number'`, `Number.isInteger(parsed.limit) === true`; negative fixtures `{limit:'50abc'}`, `'1.5'`, `'Infinity'`, `'NaN'`, `'0'`, `'-1'`, `'+50'`, `'01'`, `'5e1'`, `''`, `' 50 '`, `'9007199254740992'`, а также non-string `50` — rejected. `CaseListResponseSchema`: `{items:[{case_id:U,display_number:S,state:CaseState,category:S,location_label:S,current_iteration_no:I,updated_at:T,responsibility:S}],next_cursor:S|null}`.

`CaseSnapshotProjectionSchema` описывает **внутреннее содержимое** обязательного `case`: `case_id`, `display_number`, `state`, `revision`, `created_at`, `updated_at`, `description`, `location:{house:S,premises:S}`, `category:{name:S,result_requirement:ResultRequirement}`, `current_iteration:{iteration_id:U,number:I}`, `responsibility:{semantic_code:S,text:S}`, `initial_attachments:AttachmentMetadata[]`, `selection`, `assignment`, `current_executor`, `current_result`, `resident_feedback`, `activity`, `allowed_actions`. Current relation fields — `null` либо canonical DTO: selection `{selection_id:U,contractor:{contractor_id:U,name:S}}`; assignment `{assignment_id:U,contractor:{contractor_id:U,name:S},decision:AssignmentDecision,reject_reason?:S}`; executor `{contractor_id:U,name:S}`; result `{result_id:U,iteration_id:U,description:S,submitted_at:T,attachments:AttachmentMetadata[]}`; feedback `{feedback_id:U,result_id:U,type:ResidentFeedbackType,remark_text:S|null,created_at:T}`. `CaseSnapshotSchema` — публичный HTTP success schema `GET /api/v1/cases/{caseId}`: **strict top-level object `{case:CaseSnapshotProjectionSchema}` с required `case`**. Role-specific public validators ниже также валидируют этот top-level wrapper, заменяя только внутреннюю projection. Для одного и того же валидного canonical role-filtered inner snapshot `P` positive fixture `{case:P}` принимается, а serialized snapshot сохраняет top-level JSON `{"case":{...canonical role-filtered snapshot...}}`; negative fixture `P` как bare top-level Case object без `case` отклоняется. `{data:{...}}`, `{item:{...}}`, optional/missing `case` и union bare/wrapped недопустимы. No full DB row or current-pointer write fields. `revision` and list `updated_at` are freshness only. Sources: Interface §§6–7/30, Data Model §§9–16, Product Spec §23. Остальные fixtures: valid null current relations; ninth state, raw `content`, `sha256`, foreign/internal fields fail.

Role-specific public validators `ResidentCaseSnapshotSchema`, `UkCaseSnapshotSchema`, `ContractorCaseSnapshotSchema` choose the permitted structural projection **after** backend authorization; no role marker is added to JSON. Resident variant excludes exact `reject_reason`/UK audit/config; contractor variant excludes resident identity and other contractor/internal UK data; UK variant may carry exact own-scope rejection detail. `initial_attachments` is present only in the four permitted contexts of Interface §7; selected-only/old contractor gets no LIVE snapshot at all, not a sanitized successful response. Backend TG-017 chooses variant and performs visibility; TG-002 fixtures reject resident response containing `reject_reason` and contractor response containing UK-only fields. Source: Product Freeze §6, Product Spec §§6/23, Interface §§7/30, Task Graph TG-017.

`ActivityItemSchema`: strict `{activity_id:U,event_id:U,event_seq:I,semantic_code:EVT_001..EVT_017,occurred_at:T,iteration_no:I,actor:{role:Role,display_name:S},text:S,state_transition:{from:CaseState,to:CaseState}|null,domain:{result:ResultProjection|null,feedback:FeedbackProjection|null,comment:CommentProjection|null},attachments:AttachmentMetadata[]}`. Comment projection uses canonical `comment_id/body/created_at` from Data Model §15. One item per `event_id`, ordered by `event_seq`; `activity_id=event_id` is normative §9 but equality/order/dedup are asserted in fixture tests, not destructive transforms. `GET /cases/{id}/activity` if implemented later uses the same item schema. Negative fixtures: duplicate event/fact sibling, timestamp-sorted order, ninth event code, private channel field. Sources: Product Spec §6; Interface §9; Data Model §17.

`AllowedActionSchema` is a discriminated union on §8 code. Targets are exact canonical command IDs: `SEND_ASSIGNMENT` → `{selection_id:U,iteration_id:U}`; `ACCEPT_ASSIGNMENT`/`REJECT_ASSIGNMENT` → `{assignment_id:U}`; `ADD_RESULT_MATERIAL`/`SUBMIT_RESULT` → `{assignment_id:U,iteration_id:U}`; `RESIDENT_CONFIRM`/`RESIDENT_REMARK`/`RECORD_NO_RESIDENT_FEEDBACK` → `{result_id:U,iteration_id:U}`; `REQUEST_CLARIFICATION`/`RETURN_TO_REWORK`/`COMPLETE_WITH_EXPLANATION` → `{result_id:U,feedback_id:U}`; `COMPLETE_CASE` → `{result_id:U}`; `SELECT_CONTRACTOR` → `{iteration_id:U}` (contractor is user input, not current target); `ACCEPT_CASE`/`ADD_COMMENT` use current Case path identity, and `CREATE_CASE` is session capability outside Case snapshot. `input` may contain only documented `reject_reason_required?:B`; unlisted input hints are forbidden until coordinated contract change. `allowed_actions` remains server-generated UX hint, not authorization. Positive/negative fixtures per code verify target omission/old-ID field names/extra `contractor_id` or `actor_alias`. Sources: Interface §§8, 10–23/30; Product Spec INV-044/045.

### 11.3. Case command matrix (all requests; success uses §11.1)

All `{caseId}` paths use `U`; all mutations require idempotency header per Interface §5, except auth bootstrap. Request objects are strict. In table, `P` means JSON `payload` part of multipart and file bytes remain transport-owned.

| Command / Interface section | Exact request fields | `created` / additional success field | Positive / negative fixture |
| --- | --- | --- | --- |
| CreateCase §10 | P `{premises_id:U,category_id:U,description:S}`; optional initial files | `{iteration_id:U}`; state CREATED/revision 1 | valid IDs/text; missing premises/foreign actor field fail. |
| AcceptCase §11 | `{client_revision?:I}`; Case path is identity | `{}` | `{}` pass; required CAS or client state fail. |
| SelectContractor §12 | `{contractor_id:U,iteration_id:U}` | `{selection_id:U}` | both IDs pass; missing iteration fail. |
| SendAssignment §13 | `{selection_id:U,iteration_id:U}` | `{assignment_id:U}` | both IDs pass; contractor-only target fail. |
| AcceptAssignment §14 | `{assignment_id:U}` | `{}` | exact assignment pass; selection-only fail. |
| RejectAssignment §15 | `{assignment_id:U,reason:S}` nonempty reason | `{}` | reason pass; empty reason fail. |
| AddResultMaterial §15A | P `{assignment_id:U,iteration_id:U}` + exactly one binary file | `{attachment_id:U}` | IDs + file part pass; missing file/assignment fail. |
| SubmitResult §16 | `{assignment_id:U,iteration_id:U,description:S,material_attachment_ids:U[]}` | `{result_id:U,notification_intent_id:U}`, `notification:{status:'QUEUED'}` | exact IDs pass; missing description/DELIVERED fail. |
| ResidentConfirmation §17 | `{result_id:U,iteration_id:U}` | `{feedback_id:U}` | both IDs pass; old client result type field fail. |
| ResidentRemark §18 | P `{result_id:U,iteration_id:U,remark_text:S}` + optional files | `{feedback_id:U}` | current targets/text pass; missing result fail. |
| RequestClarification §19 | `{result_id:U,feedback_id:U,message:S}` JSON or same P with optional files | `{comment_id:U}` | result+feedback pass; client iteration fail. |
| RecordNoResidentFeedback §19A | `{result_id:U,iteration_id:U,basis_confirmed:true,basis_note:S}` | `{}`, top-level `no_feedback_event_id:U` | true/manual note pass; false/timer field fail. |
| ReturnToRework §20 | `{result_id:U,feedback_id:U}` | `{iteration_id:U,iteration_no:I}`, two `event_ids` | exact pair pass; client iteration fail. |
| CompleteCase §21 | `{result_id:U,basis:{type:'RESIDENT_CONFIRMATION',feedback_id:U}}` **or** `{result_id:U,basis:{type:'NO_RESIDENT_FEEDBACK',event_id:U,completion_basis:{confirmed:true,process_reference:S}}}` | `{}` | both basis branches pass; EVT-015 alone/mixed branches fail. |
| CompleteWithExplanation §22 | `{result_id:U,feedback_id:U,explanation:S}` | `{}`; only EVT-017 | explanation pass; empty/client iteration fail. |
| AddComment §23 | P `{body:string,clarification_request_id:U|null}` + optional files | `{comment_id:U}` | body/context pass; client private channel fail. Empty body plus file is permitted by §23; backend validates the body-or-file rule and schema must not ban that variant. |

For methods without explicitly shown individual success payload, `created` follows Interface §32: IDs of only entities the documented transaction creates. Case state in success is post-command state, not client input. Zod verifies structure; ownership/currentness/first-valid-wins and nonempty attachment content remain owning backend tasks. Source: Interface §§10–23/29/32–33; Product Spec §23.

### 11.4. Configuration, demo, headers и serialization

`ConfigurationRequestSchemas` mirror Interface §24 exactly: Organization PATCH `{name:S}`; House POST `{address:S,display_label:S|null,active:B}`, PATCH nonempty partial of those fields; Category POST `{name:S,description:S|null,default_contractor_id:U|null,requires_premises_access:B,result_requirement:ResultRequirement,active:B}`, PATCH nonempty partial; Contractor POST `{display_name:S}`; Contractor binding PUT `{active:B}`; User role-binding PUT `{role:Role,contractor_id:U|null,house_ids:U[],active?:B}` (`active` — existing `UserRoleBinding.active`; omitted means active create/update, `false` is explicit deactivation from §24.7); Contractor employee PUT `{active:B}`. Path IDs (`houseId/categoryId/contractorId/appUserId`) are `U`. No `organization_id` request body. Positive fixture per endpoint; negative: unknown tenant selector, fifth role, missing required create field, empty patch, extra HR/user-creation field. Source: Interface §§24.3–24.8; Data Model §§3–8; Product Spec §§10/23.

`ConfigurationReadResponseSchemas` are minimal own-Organization projections with **only canonical entity fields**; TG-002 pins their wire grouping here, not new business facts: `GET /config/organization` → direct `{organization_id:U,name:S,active:B}`; `/houses` → direct array `{house_id:U,address:S,display_label:S|null,active:B}[]`; `/categories` → direct array `{category_id:U,name:S,description:S|null,default_contractor_id:U|null,requires_premises_access:B,result_requirement:ResultRequirement,active:B}[]`; `/contractors` → direct array `{contractor:{contractor_id:U,display_name:S,active:B},organization_contractor:{organization_id:U,contractor_id:U,active:B}}[]`; `/users` → direct array `{app_user:{app_user_id:U,display_name:S,active:B},role_bindings:{role_binding_id:U,role:Role,organization_id:U|null,contractor_id:U|null,active:B}[],uk_house_access:{house_id:U,active:B}[]}[]`. The nested object names correspond exactly to Data Model entities; no invented availability/permissions boolean. Config mutation success returns corresponding own-scope resource projection with HTTP 200/201 per Interface §31, without Case command envelope. Foreign Org rows never passed to this schema as a successful read. Positive fixtures use active/inactive own rows and nullable category/role fields; negative fixtures reject secret/foreign-tenant additions, fifth role, dangling `contractor_id` type and unknown `binding_active` convenience field. Sources: Interface §§24.1–24.10/31; Data Model §§3–8; Product Spec §§10/18–19/23.

`DemoRunStartRequestSchema` = strict `{scenario_key:'primary-housing-demo'}`; `DemoRunStartResponseSchema` = strict `{demo_run_id:U,status:'ACTIVE',primary_case_id:U|null,role_views:[RESIDENT,UK_EMPLOYEE,UK_ADMIN,CONTRACTOR_EMPLOYEE]}` with exactly four views. Start and actor switch use idempotency header and `MAX_IDENTITY` principal at technical pre-effective stage; server chooses actor, not request. Positive fixture has null primary Case; negative fixture has extra contractor A/B role view or client actor alias. Sources: Interface §§3.3/5/25; Data Model §35; Product Spec §20.

Headers: `Authorization` is Bearer token for protected application requests; optional `X-Request-Id` UUID; `Idempotency-Key` nonempty UUID/random opaque string for mutating requests; optional `Idempotency-Replayed:true` response. Header presence/replay logic belongs runtime TG-010/012/019; TG-002 schemas only parse normalized header values. `GET /api/v1/system/info` JSON is strict `{build_sha:S}`; no environment values/secrets. UUIDs serialize as strings; time as UTC strings; no DB timestamp objects or file bytes in JSON. Sources: Interface §§1.2–1.4/5/31.
