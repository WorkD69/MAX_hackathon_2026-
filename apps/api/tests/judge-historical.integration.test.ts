import { expect, it } from 'vitest';
import { productFixture, ids } from './product-fixture.js';
import { registerExecutionRoutes } from '../src/modules/cases/commands/execution/index.js';
import { registerFeedbackResolutionRoutes } from '../src/modules/cases/commands/feedback-resolution/index.js';
import { registerReadModelRoutes } from '../src/modules/read-models/index.js';
import { registerAttachmentRoutes } from '../src/modules/attachments/index.js';

const f = await productFixture();
registerExecutionRoutes(f.app, f.config, { database: f.db });
registerFeedbackResolutionRoutes(f.app, f.config, { database: f.db });
registerReadModelRoutes(f.app, f.config, { database: f.db });
registerAttachmentRoutes(f.app, f.config, { database: f.db });

it('audits real A→B history, immutable Result links, same-A continuation and immediate loss of A LIVE authority', async () => {
  const c = await f.execute();
  const upload = (actor: string, assignmentId: string, iterationId: string, name: string) =>
    f.multipart(`/api/v1/cases/${c.caseId}/result-materials`, actor, { assignment_id: assignmentId, iteration_id: iterationId }, [{ field: 'file', name }]);
  const aFile = await upload('a', c.assignmentId, c.iterationId, 'proof-a.txt');
  const excluded = await upload('a', c.assignmentId, c.iterationId, 'excluded-from-result.txt');
  expect(aFile.statusCode, aFile.body).toBe(200); expect(excluded.statusCode).toBe(200);
  const aId = aFile.json().created.attachment_id;
  const first = await f.json(c.caseId, 'submit-result', 'a', { assignment_id: c.assignmentId,
    iteration_id: c.iterationId, description: 'Первый результат А', material_attachment_ids: [aId] });
  expect(first.statusCode, first.body).toBe(200);
  const aResult = first.json().created.result_id;
  const immutable = async () => ({
    result: await f.db.selectFrom('result').selectAll().where('result_id', '=', aResult).execute(),
    links: await f.db.selectFrom('result_attachment').selectAll().where('result_id', '=', aResult).execute(),
    assignment: await f.db.selectFrom('assignment').selectAll().where('assignment_id', '=', c.assignmentId).execute(),
    materials: await f.db.selectFrom('work_material_attachment').selectAll().where('assignment_id', '=', c.assignmentId).orderBy('attachment_id').execute(),
    event: await f.db.selectFrom('case_event').selectAll().where('case_id', '=', c.caseId).where('event_type', '=', 'EVT_008').where('result_id', '=', aResult).execute(),
  });
  const original = await immutable();
  expect(original.links.map(link => link.attachment_id)).toEqual([aId]);
  expect(original.materials).toHaveLength(2); // Omission from Result never deletes the upload event/material.
  const remark = await f.json(c.caseId, 'resident-remark', 'resident', { result_id: aResult, iteration_id: c.iterationId, remark_text: 'Холодный стояк' });
  const returned = await f.json(c.caseId, 'return-to-rework', 'uk', { result_id: aResult, feedback_id: remark.json().created.feedback_id });
  expect(returned.statusCode, returned.body).toBe(200);
  const nextIteration = returned.json().created.iteration_id;
  const read = (actor: string) => f.app.inject({ url: `/api/v1/cases/${c.caseId}`, headers: f.headers(actor) });
  const sameA = (await read('a')).json().case;
  expect(sameA.current_executor.contractor_id).toBe(ids.contractorA);
  expect(sameA.assignment.assignment_id).toBe(c.assignmentId);
  expect(sameA.allowed_actions.map((item: { code: string }) => item.code)).toContain('SUBMIT_RESULT');
  expect(sameA.allowed_actions.map((item: { code: string }) => item.code)).not.toContain('ACCEPT_ASSIGNMENT');
  const selected = await f.json(c.caseId, 'select-contractor', 'uk', { iteration_id: nextIteration, contractor_id: ids.contractorB });
  expect(selected.statusCode, selected.body).toBe(200);
  expect((await read('a')).statusCode).toBe(404); expect((await read('b')).statusCode).toBe(404);
  expect((await upload('a', c.assignmentId, nextIteration, 'stale-a.txt')).statusCode).toBe(404);
  const sent = await f.json(c.caseId, 'send-assignment', 'uk', { iteration_id: nextIteration, selection_id: selected.json().created.selection_id });
  const bAssignment = sent.json().created.assignment_id;
  expect((await read('b')).json().case.current_result).toBeNull();
  expect((await f.json(c.caseId, 'accept-assignment', 'b', { assignment_id: bAssignment })).statusCode).toBe(200);
  const bFile = await upload('b', bAssignment, nextIteration, 'proof-b.txt');
  const bId = bFile.json().created.attachment_id;
  const second = await f.json(c.caseId, 'submit-result', 'b', { assignment_id: bAssignment, iteration_id: nextIteration,
    description: 'Второй результат Б', material_attachment_ids: [bId] });
  expect(second.statusCode, second.body).toBe(200);
  expect(await immutable()).toEqual(original);
  for (const actor of ['resident', 'uk', 'admin']) {
    const response = await read(actor); expect(response.statusCode, response.body).toBe(200);
    const value = response.json().case;
    expect(value.current_executor.contractor_id).toBe(ids.contractorB);
    const results = value.activity.filter((item: { domain: { result: unknown } }) => item.domain.result);
    expect(results.map((item: { actor: { display_name: string } }) => item.actor.display_name)).toEqual(['Демо Мастер Подрядчика А', 'Демо Мастер Подрядчика Б']);
    expect(results.map((item: { iteration_no: number }) => item.iteration_no)).toEqual([1, 2]);
    expect(results.map((item: { domain: { result: { attachments: { attachment_id: string }[] } } }) => item.domain.result.attachments.map(a => a.attachment_id))).toEqual([[aId], [bId]]);
    expect(new Set(value.activity.map((item: { event_id: string }) => item.event_id)).size).toBe(value.activity.length);
    expect(value.activity.some((item: { attachments: { attachment_id: string }[] }) => item.attachments.some(a => a.attachment_id === excluded.json().created.attachment_id))).toBe(true);
    expect((await f.app.inject({ url: `/api/v1/attachments/${aId}`, headers: f.headers(actor) })).statusCode).toBe(200);
  }
  const b = (await read('b')).json().case;
  expect(b.activity.filter((item: { domain: { result: unknown } }) => item.domain.result).map((item: { actor: { display_name: string } }) => item.actor.display_name)).toEqual(['Демо Мастер Подрядчика Б']);
  expect((await f.app.inject({ url: `/api/v1/attachments/${aId}`, headers: f.headers('b') })).statusCode).toBe(404);
  expect((await f.app.inject({ url: `/api/v1/attachments/${bId}`, headers: f.headers('b') })).statusCode).toBe(200);
}, 60000);
