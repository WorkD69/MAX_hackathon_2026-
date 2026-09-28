import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
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
const report = { viewport: `${width}x${width > 600 ? 900 : 844}`, happy: false, rework: false, sameExecutorRework: false, rejectionB: false, repeat: false, download: false };
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
  await page.getByRole('link', { name: 'Основной случай' }).waitFor();
  return created.case_id;
}
async function assign(id, index = 1) {
  const select = page.locator('select[name="contractor_id"]');
  await select.locator('option').nth(index).waitFor({ state: 'attached' });
  await select.selectOption({ index });
  await button('Выбрать подрядчика', 'select-contractor', id);
  return button('Отправить назначение', 'send-assignment', id);
}
async function execute(id, name, accept = true) {
  await role('CONTRACTOR_EMPLOYEE');
  if (accept) await post(`/api/v1/cases/${id}/commands/accept-assignment`, () => page.getByTestId('accept-assignment').click());
  await page.locator('#contractor-result-file').setInputFiles({ name: 'result.png', mimeType: 'image/png', buffer: png });
  await post(`/api/v1/cases/${id}/result-materials`, () => page.getByTestId('upload-material').click());
  await page.getByLabel('Загруженные материалы', { exact: true }).waitFor();
  await page.locator('#contractor-result-description').fill(name);
  await post(`/api/v1/cases/${id}/commands/submit-result`, () => page.getByTestId('submit-result').click());
}
async function confirmClose(id) {
  await role('RESIDENT');
  await post(`/api/v1/cases/${id}/commands/resident-confirmation`, () => page.getByTestId('confirm-submit').click());
  await page.getByTestId('confirm-success').waitFor();
  await role('UK_EMPLOYEE');
  const closed = await button('Завершить случай', 'complete', id);
  assert.equal(closed.state, 'COMPLETED');
  await page.getByTestId('case-status').filter({ hasText: 'Заверш' }).waitFor();
}
try {
  await page.goto(`${base}/launch`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('demo-start').waitFor();
  const happy = await createCase('Браузер: отопление в квартире');
  await role('UK_EMPLOYEE'); await button('Принять случай', 'accept', happy); await assign(happy);
  await execute(happy, 'Браузер: восстановили отопление');
  await role('RESIDENT');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать result.png', exact: true }).click();
  assert.equal((await download).suggestedFilename(), 'result.png'); report.download = true;
  await confirmClose(happy); report.happy = true;
  if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, 'happy-completed.png'), fullPage: true }); }

  const rework = await createCase('Браузер: повторная проверка');
  assert.notEqual(rework, happy); report.repeat = true;
  await role('UK_EMPLOYEE'); await button('Принять случай', 'accept', rework); await assign(rework);
  await execute(rework, 'Первый неизменяемый результат');
  await role('RESIDENT'); await page.getByTestId('remark-input').fill('Остался холодный стояк');
  await post(`/api/v1/cases/${rework}/commands/resident-remark`, () => page.getByTestId('remark-submit').click());
  await role('UK_EMPLOYEE');
  const returned = await button('Вернуть на доработку', 'return-to-rework', rework);
  assert.equal(returned.created.iteration_no, 2);
  await assign(rework); // Only B is eligible for replacement in REWORK.
  await execute(rework, 'Второй результат подрядчика B');
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
  await execute(same, 'Доработка A в итерации 2', false); await confirmClose(same); report.sameExecutorRework = true;
  await role('UK_ADMIN'); await page.getByRole('link', { name: 'Настройки', exact: true }).click();
  await page.getByRole('heading', { name: 'Настройка организации', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report));
  if (output) await writeFile(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
} catch (error) {
  if (output) { await mkdir(output, { recursive: true }); await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); }
  console.error(await page.locator('body').innerText()); throw error;
} finally { await browser.close(); }
