# TG-013 — canonical StartDemoRun session delta

## 1. Статус и источники

`TASK_ID=TG-013`; `RISK_CLASS=CRITICAL`; `BASE_SHA=28401166a340407297cfb942fd9a8bf978e6c2a2`; branch `codex/canonical-start-session-delta`. Это targeted forward delta к DemoRun/session contract. На заданной базе прежний файл TG-013 не присутствует; этот документ фиксирует действующее правило без изменения Product Freeze, Product Spec или Task Graph. Нормативные источники: `docs/01_PRODUCT_FREEZE.md`, `docs/02_PRODUCT_SPEC.md`, `docs/05_INTERFACE_CONTRACTS.md` §§2–5/25, `docs/07_DECISIONS.md` ADR-016/017/021/028. TG-010 владеет issuer/application session, TG-011 — current authorization policy, TG-012 — transaction/idempotency kernel, TG-013 — DemoRun lifecycle и orchestration этих seams.

## 2. Start и граница авторизации

`POST /api/v1/demo/runs` принимает только `{scenario_key:"primary-housing-demo"}`, текущий application Bearer и `Idempotency-Key`. Сервер проверяет подпись/expiry Bearer, его real `MAX_IDENTITY`, `DEMO_MODE`, usable outbound MAX target и применимую current policy; identity, run и actor выводятся сервером, не из body. Исходный MAX `initData` может уже истечь. Start **не** вызывает `/auth/max`, не принимает expired initData и не устанавливает новую identity. Actor-scoped права текущего Bearer проверяются перед mutation; actor-null Bearer допускается для Start в пределах canonical demo policy.

Владелец новой транзакции резервирует key/fingerprint под `MAX_IDENTITY`, сериализуется по MaxIdentity/current run, архивирует прежний ACTIVE run только техническим статусом/временем, создаёт новый ACTIVE run и deterministic allowlist `DemoRunActor`, затем вызывает TG-010 issuance seam для **той же server-derived** MAX identity и **нового** run внутри того же atomic command. Новый signed token имеет `demo_run_id` нового run, `primary_case_id=null`, `effective_actor.app_user_id=null`, `effective_actor.role=null` и internal selected role/binding `null`. Start не выбирает actor и не создаёт Case. Ровно четыре публичные role views сохраняются; явный switch обязателен до actor-scoped действий. Старые Case, events и history не меняются.

`201` возвращает `{demo_run_id,status:'ACTIVE',primary_case_id:null,role_views:[RESIDENT,UK_EMPLOYEE,UK_ADMIN,CONTRACTOR_EMPLOYEE],session_token,expires_at,session}`. `session` имеет существующую TG-010 форму с той же `real_max_identity.max_identity_id`, `demo_mode:true`, `demo_run_id` нового run и actor-null context. Canonical status/body/token/expiry сохраняются в `CommandExecution` до commit. Если token issuance, serialization или сохранение ответа не удаётся, **вся** транзакция откатывается: прежний run не архивирован, новый run/actors не существуют, successful execution не записан. Token нельзя выпускать после commit как отдельный bootstrap.

## 3. Replay, старый token и гонки

После проверки текущего Bearer и security gate тот же `MAX_IDENTITY` + key + fingerprint возвращает **точно** сохранённый `201` status/body/token/`expires_at`; повторная подпись, новый token, продление TTL и новая mutation запрещены. Сохранённый token может уже истечь. Другой fingerprint с тем же key получает `409 IDEMPOTENCY_KEY_REUSE`. Разные keys сериализуются по identity: в конце транзакции существует не более одного ACTIVE run. Protected replay старого, уже archived run отклоняется до раскрытия archived response.

Старый Bearer никогда не перенастраивается на новый run и не даёт business authority к нему, включая switch, Case, reads и replay других команд. Узкое существующее исключение для Start-only actor-null retry можно сохранить: старый actor-null Bearer той же real identity и тот же key/fingerprint могут получить **только** уже сохранённый Start success, пока сохранённый run остаётся current и TG-012/current identity gate пройден. Исключение не выбирает actor, не выдаёт новый token и не разрешает другие операции. Actor-bound stale token или чужая identity этим исключением не легализуются.

Start, switch, `CreateCase` и restore согласуют locks/current-run validation: response не смешивает run/Case разных транзакций; ранее выданный stale token отклоняется при следующем protected request. Первый `CreateCase` после explicit Resident switch отдельно связывает `primary_case_id` с новым run; Start сам этого не делает.

## 4. Acceptance и targeted проверки для будущей implementation

- Still-valid application Bearer при expired original MAX initData успешно запускает новый run и получает новый token/context той же identity без `/auth/max`; expired initData на самом `/auth/max` остаётся отвергнутым.
- Новый session token содержит новый run, `primary_case_id=null`, actor/role/binding null; switch обязателен; Start не создаёт Case. Два sequential/different-key Starts оставляют один ACTIVE run, прежние Case/history неизменны.
- Same-key/fingerprint replay возвращает byte-equivalent persisted body/token/expiry/status без TTL extension; mismatch fingerprint даёт `409`; если saved run archived, protected replay denied. Actor-null Start-only retry работает только в описанной границе.
- Отказ issuer/response persistence после archive/create откатывает архивирование, run, actors и execution; проверка на real PostgreSQL. Current Bearer/identity, binding/policy и ownership revalidation остаются server-authoritative.
- Старый token не проходит switch/Case/read нового run; гонки Start/switch/Case/restore не дают старой authority и не смешивают контексты. TG-010 session issuer, TG-011 policy и TG-012 kernel интегрируются через их владельцев, без второго auth framework.

Эта правка только канонизирует контракт и публичную Zod-схему. Runtime implementation и `main` не изменяются; после commit нужен один independent review до реализации.
