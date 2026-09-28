import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.LOCAL_DEMO_URL ?? 'https://localhost:4301';
if (new URL(base).hostname !== 'localhost') throw new Error('LOOPBACK_DEMO_REQUIRED');
const output = process.env.LOCAL_SMOKE_OUTPUT;
const browser = await chromium.launch({ headless: true, channel: process.env.LOCAL_BROWSER_CHANNEL ?? 'msedge' });
const width = Number(process.env.LOCAL_VIEWPORT_WIDTH ?? 390);
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width, height: width > 600 ? 900 : 844 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const report = { viewport: `${width}x${width > 600 ? 900 : 844}`, happy: false, rework: false, sameExecutorRework: false,
  rejectionB: false, repeat: false, download: false, historicalAttribution: false, clarification: false,
  configurationNewCase: false, materialDraft: false, committedReadonly: false, terminal: false, rolesStates: [] };
const matrix = new Set();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j/pkAAAAASUVORK5CYII=', 'base64');
async function post(pathname, action) {
  const response = page.waitForResponse(response => new URL(response.url()).pathname === pathname && response.request().method() === 'POST');
  await action();
  const received = await response;
  assert.ok(received.status() < 300, `${pathname}: ${received.status()} ${await received.text()}`);
  return received.json();
}
async function role(value) {
  await post('/api/v1/demo/session/actor', () => page.locator(`[data-role-view="${value}"]`).click());
  await page.locator(`[data-role-view="${value}"][aria-pressed="true"]`).waitFor();
}
async function auditUi() {
  const text = await page.locator('body').innerText();
  assert.doesNotMatch(text, /\b(?:CONFIRMATION|REMARK|EXECUTION|REWORK|UK_ADMIN|RESIDENT)\b|[Ии]тераци|\d{4}-\d\d-\d\dT\d\d:|\[SYNTHETIC\]|DemoRun|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}/);
  const eventIds = await page.locator('[data-event-id]').evaluateAll(items => items.map(item => item.getAttribute('data-event-id')));
  assert.equal(new Set(eventIds).size, eventIds.length, 'One CaseEvent must have exactly one activity card');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), false, 'No horizontal overflow');
}
async function inspectState(id, state) {
  for (const view of ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE']) {
    await role(view);
    if (view === 'CONTRACTOR_EMPLOYEE' && ['CREATED', 'ACCEPTED_BY_UK', 'COMPLETED'].includes(state)) {
      await expect(page.getByRole('alert').filter({ hasText: 'Случай недоступен' })).toBeVisible();
    } else {
      const expected = { CREATED: 'Создано', ACCEPTED_BY_UK: 'Принято УК', SENT_TO_CONTRACTOR: 'Передано подрядчику',
        EXECUTION: 'Исполнение', AWAITING_RESULT_CHECK: 'Ожидается проверка результата', REMARKS_REVIEW: 'Замечания рассматриваются', REWORK: 'Доработка', COMPLETED: 'Завершено' }[state];
      await expect(page.locator('[data-testid$="case-status"]')).toHaveText(expected);
    }
    await auditUi(); matrix.add(`${view}:${state}`);
  }
}
async function button(label, slug, id) {
  return post(`/api/v1/cases/${id}/commands/${slug}`, () => page.getByRole('button', { name: label, exact: true }).click());
}
async function createCase(description) {
  await post('/api/v1/demo/runs', () => page.getByTestId('demo-start').click());
  await role('RESIDENT');
  await page.getByRole('link', { name: 'Создать обращение', exact: true }).click();
  const address = page.getByTestId('premise-select');
  await address.locator('option').nth(1).waitFor({ state: 'attached' });
  await address.selectOption({ index: 1 });
  const category = page.getByTestId('category-select');
  await category.locator('option').nth(1).waitFor({ state: 'attached' });
  await category.selectOption({ index: 1 });
  await page.getByTestId('description-input').fill(description);
  const created = await post('/api/v1/cases', () => page.getByTestId('create-case-submit').click());
  await page.waitForURL(url => url.pathname === `/cases/${created.case_id}`);
  await page.getByRole('link', { name: 'Текущее обращение', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Создать обращение', exact: true }).count(), 0);
  return created.case_id;
}
async function assign(id, index = 1) {
  const replace = page.getByRole('button', { name: 'Сменить подрядчика', exact: true });
  if (await replace.count()) await replace.click();
  const select = page.locator('select[name="contractor_id"]');
  await select.locator('option').nth(index).waitFor({ state: 'attached' });
  await select.selectOption({ index });
  await button('Выбрать подрядчика', 'select-contractor', id);
  await expect(page.locator('.uk-workflow__facts')).toContainText('Задание ещё не направлено');
  const selected = await page.locator('.uk-workflow__facts').innerText();
  const candidateName = selected.match(/Выбран: (.+)\. Задание/)?.[1];
  if (candidateName) assert.equal(await select.locator('option').filter({ hasText: candidateName }).count(), 0, 'No repeated same selection');
  return post(`/api/v1/cases/${id}/commands/send-assignment`, () => page.getByRole('button', { name: /^Направить: / }).click());
}
async function execute(id, name, accept = true) {
  await role('CONTRACTOR_EMPLOYEE');
  if (accept) await post(`/api/v1/cases/${id}/commands/accept-assignment`, () => page.getByTestId('accept-assignment').click());
  if (!accept) await expect(page.getByTestId('accept-assignment')).toHaveCount(0);
  await page.locator('#contractor-result-file').setInputFiles({ name: 'result.png', mimeType: 'image/png', buffer: png });
  await page.getByTestId('remove-local-material').click();
  await expect(page.getByTestId('upload-material')).toBeDisabled();
  await page.locator('#contractor-result-file').setInputFiles({ name: 'result.png', mimeType: 'image/png', buffer: png });
  await post(`/api/v1/cases/${id}/result-materials`, () => page.getByTestId('upload-material').click());
  await page.getByLabel('Загруженные материалы', { exact: true }).waitFor();
  await expect(page.getByTestId('toggle-draft-material')).toHaveText('Не включать в результат');
  await page.getByTestId('toggle-draft-material').click();
  await expect(page.getByLabel('Загруженные материалы', { exact: true })).toContainText('Не включён в результат');
  await page.getByTestId('toggle-draft-material').click(); report.materialDraft = true;
  await page.locator('#contractor-result-description').fill(name);
  await post(`/api/v1/cases/${id}/commands/submit-result`, () => page.getByTestId('submit-result').click());
  await expect(page.getByTestId('toggle-draft-material')).toHaveCount(0);
  await expect(page.locator('input[type="checkbox"], [data-draft-material]')).toHaveCount(0);
  await expect(page.getByTestId('submit-result')).toHaveCount(0); report.committedReadonly = true;
  const card = page.locator('[data-event-id]').filter({ has: page.getByTestId('result-description').filter({ hasText: name }) });
  await expect(card).toContainText('result.png');
  assert.equal((await card.innerText()).split(name).length - 1, 1, 'Result description once inside its card');
  await auditUi();
}
async function confirmClose(id) {
  await role('RESIDENT');
  await post(`/api/v1/cases/${id}/commands/resident-confirmation`, () => page.getByTestId('confirm-submit').click());
  await page.getByTestId('confirm-success').waitFor();
  await expect(page.getByTestId('resident-case-status')).toHaveText('Ожидается проверка результата');
  await role('UK_EMPLOYEE');
  await expect(page.getByText('Житель подтвердил результат.', { exact: true })).toBeVisible();
  await expect(page.locator('.case-actions')).toContainText('от имени УК');
  await expect(page.locator('.case-actions textarea')).toHaveCount(0);
  const closed = await button('Завершить обращение', 'complete', id);
  assert.equal(closed.state, 'COMPLETED');
  await page.getByTestId('case-status').filter({ hasText: 'Заверш' }).waitFor();
  assert.equal(await page.locator('.case-actions form').count(), 0); report.terminal = true;
  await auditUi();
}
try {
  await page.goto(`${base}/launch`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('demo-start').waitFor();
  const happy = await createCase('Браузер: отопление в квартире');
  await inspectState(happy, 'CREATED');
  await role('UK_EMPLOYEE'); await button('Принять случай', 'accept', happy);
  await inspectState(happy, 'ACCEPTED_BY_UK'); await role('UK_EMPLOYEE'); await assign(happy);
  await inspectState(happy, 'SENT_TO_CONTRACTOR');
  await role('CONTRACTOR_EMPLOYEE');
  await post(`/api/v1/cases/${happy}/commands/accept-assignment`, () => page.getByTestId('accept-assignment').click());
  await inspectState(happy, 'EXECUTION');
  await execute(happy, 'Браузер: восстановили отопление', false);
  await inspectState(happy, 'AWAITING_RESULT_CHECK');
  await role('RESIDENT');
  const download = page.waitForEvent('download');
  await page.getByLabel('Материалы результата', { exact: true }).getByRole('button', { name: 'Скачать result.png', exact: true }).click();
  assert.equal((await download).suggestedFilename(), 'result.png'); report.download = true;
  await confirmClose(happy); report.happy = true;
  if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, 'happy-completed.png'), fullPage: true }); }
  await inspectState(happy, 'COMPLETED');

  const rework = await createCase('Браузер: повторная проверка');
  assert.notEqual(rework, happy); report.repeat = true;
  await role('UK_EMPLOYEE'); await button('Принять случай', 'accept', rework); await assign(rework);
  await execute(rework, 'Первый неизменяемый результат');
  await role('RESIDENT'); await page.getByTestId('remark-input').fill('Остался холодный стояк');
  await post(`/api/v1/cases/${rework}/commands/resident-remark`, () => page.getByTestId('remark-submit').click());
  await inspectState(rework, 'REMARKS_REVIEW');
  await role('UK_EMPLOYEE');
  const returned = await button('Вернуть на доработку', 'return-to-rework', rework);
  assert.equal(returned.created.iteration_no, 2);
  await inspectState(rework, 'REWORK'); await role('UK_EMPLOYEE');
  await expect(page.getByText('Работу продолжает:', { exact: false })).toBeVisible();
  await expect(page.locator('select[name="contractor_id"]')).toHaveCount(0);
  await assign(rework); // Only B is eligible for replacement in REWORK.
  await execute(rework, 'Второй результат подрядчика B');
  for (const view of ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN']) {
    await role(view);
    const a = page.locator('[data-event-id]').filter({ has: page.getByTestId('result-description').filter({ hasText: 'Первый неизменяемый результат' }) });
    const b = page.locator('[data-event-id]').filter({ has: page.getByTestId('result-description').filter({ hasText: 'Второй результат подрядчика B' }) });
    await expect(a).toContainText('Демо Мастер Подрядчика А'); await expect(a).toContainText('Первичное выполнение');
    await expect(a).toContainText('result.png'); await expect(a).not.toContainText('Мастер Подрядчика Б');
    await expect(b).toContainText('Демо Мастер Подрядчика Б'); await expect(b).toContainText('Доработка №1');
    await expect(b).toContainText('result.png'); await auditUi();
  }
  report.historicalAttribution = true;
  await confirmClose(rework); report.rework = true;

  const rejected = await createCase('Браузер: отказ A и назначение B');
  await role('UK_EMPLOYEE'); await button('Принять случай', 'accept', rejected); await assign(rejected);
  await role('CONTRACTOR_EMPLOYEE'); await page.locator('#contractor-reject-reason').fill('Нет свободной бригады');
  await post(`/api/v1/cases/${rejected}/commands/reject-assignment`, () => page.getByTestId('reject-assignment').click());
  await role('UK_EMPLOYEE'); await assign(rejected, 2);
  await execute(rejected, 'Подрядчик B выполнил работу после отказа A');
  await confirmClose(rejected); report.rejectionB = true;
  const same = await createCase('Браузер: доработка тем же исполнителем');
  await role('UK_EMPLOYEE'); await button('Принять случай', 'accept', same); await assign(same);
  await execute(same, 'Первая работа A'); await role('RESIDENT');
  await page.getByTestId('remark-input').fill('Проверьте ещё раз');
  await post(`/api/v1/cases/${same}/commands/resident-remark`, () => page.getByTestId('remark-submit').click());
  await role('UK_EMPLOYEE'); await button('Вернуть на доработку', 'return-to-rework', same);
  await execute(same, 'Повторная работа A', false); await confirmClose(same); report.sameExecutorRework = true;
  await role('UK_ADMIN'); await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByRole('heading', { name: 'Настройка организации', exact: true }).waitFor();
  await auditUi();
  await role('RESIDENT');
  await expect(page).toHaveURL(new RegExp(`/cases/${same}$`));

  const clarification = await createCase('Браузер: уточнение замечания');
  await role('UK_EMPLOYEE'); await button('Принять случай', 'accept', clarification); await assign(clarification);
  await execute(clarification, 'Результат до уточнения'); await role('RESIDENT');
  await page.getByTestId('remark-input').fill('Тепло не восстановилось');
  await post(`/api/v1/cases/${clarification}/commands/resident-remark`, () => page.getByTestId('remark-submit').click());
  await role('UK_EMPLOYEE'); await page.locator('textarea[name="message"]').fill('Уточните температуру стояка');
  await button('Запросить уточнение', 'request-clarification', clarification);
  await role('RESIDENT'); await page.getByTestId('clarification-select').selectOption({ index: 1 });
  await page.getByTestId('comment-input').fill('Стояк холодный на ощупь');
  await post(`/api/v1/cases/${clarification}/comments`, () => page.getByTestId('comment-submit').click());
  await expect(page.getByTestId('clarification-select')).toHaveCount(0);
  await expect(page.locator('[data-event-id]').filter({ hasText: 'Стояк холодный на ощупь' })).toHaveCount(1);
  await role('UK_EMPLOYEE'); await page.locator('textarea[name="explanation"]').fill('Результат принят после осмотра УК');
  await button('Завершить с объяснением', 'complete-with-explanation', clarification); report.clarification = true;

  // Change through the admin UI; a new run gets new configuration, existing Case snapshots stay frozen.
  await role('UK_ADMIN'); await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  const form = page.locator('[data-testid="category-edit-form"]').first();
  const originalName = await form.locator('input[name="name"]').inputValue();
  const configuredName = `${originalName} · обновлена для новых обращений`;
  await form.locator('input[name="name"]').fill(configuredName);
  const response = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes('/config/categories/'));
  await form.getByRole('button', { name: /^Обновить категорию / }).click();
  assert.equal((await response).status(), 200);
  await role('RESIDENT'); await expect(page.locator('body')).not.toContainText(configuredName);
  const newCase = await createCase('Браузер: новая конфигурация');
  assert.notEqual(newCase, clarification);
  // Creation uses the alphabetically first category, which is the one updated above.
  await role('UK_EMPLOYEE'); await expect(page.locator('.case-details__summary')).toContainText(configuredName);
  report.configurationNewCase = true;
  await role('UK_ADMIN'); await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  const restore = page.locator('[data-testid="category-edit-form"]').first();
  await restore.locator('input[name="name"]').fill(originalName);
  const restored = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().includes('/config/categories/'));
  await restore.getByRole('button', { name: /^Обновить категорию / }).click(); assert.equal((await restored).status(), 200);
  await auditUi();
  report.rolesStates = [...matrix]; assert.equal(matrix.size, 32);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report));
  if (output) await writeFile(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
} catch (error) {
  if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); }
  console.error(await page.locator('body').innerText()); throw error;
} finally { await browser.close(); }
