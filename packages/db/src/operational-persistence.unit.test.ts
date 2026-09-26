import { promises as fs } from 'node:fs';
import type { Migration } from 'kysely/migration';
import * as operational from '../dist/migrations/0003_operational_persistence.js';
import { expect, expectTypeOf, test } from 'vitest';

test('TG-007 operational migration exports up and down', () => {
  expect(typeof operational.up).toBe('function');
  expect(typeof operational.down).toBe('function');
  expectTypeOf(operational).toMatchTypeOf<Migration>();
});

test('TG-007 migration declares exact operational tables and downstream links', async () => {
  const text = await fs.readFile(new URL('../migrations/0003_operational_persistence.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  for (const table of [
    'command_execution',
    'attachment',
    'case_initial_attachment',
    'work_material_attachment',
    'result_attachment',
    'feedback_attachment',
    'comment_attachment',
    'notification_intent',
    'configuration_change',
  ]) expect(normalized).toContain(`CREATE TABLE ${table}`);
  expect(normalized).toContain('fk_event_command_id');
  expect(normalized).toContain('fk_event_attachment_id');
  expect(normalized).toContain('fk_work_material_attachment_event FOREIGN KEY (case_id, created_event_id) REFERENCES case_event (case_id, event_id) DEFERRABLE INITIALLY DEFERRED');
});

test('TG-007 migration pins idempotency and notification uniqueness', async () => {
  const text = await fs.readFile(new URL('../migrations/0003_operational_persistence.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  expect(normalized).toContain("WHERE principal_type = 'APP_USER'");
  expect(normalized).toContain("WHERE principal_type = 'MAX_IDENTITY'");
  expect(normalized).toContain('CONSTRAINT uq_notification_intent_dedupe_key UNIQUE (dedupe_key)');
  expect(normalized).toContain('CONSTRAINT uq_notification_intent_result_kind UNIQUE (result_id, notification_kind)');
});

test('TG-007 migration contains DB immutability guards', async () => {
  const text = await fs.readFile(new URL('../migrations/0003_operational_persistence.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  expect(normalized).toContain('tg007_attachment_immutable');
  expect(normalized).toContain('tg007_command_execution_immutable');
  expect(normalized).toContain('tg007_reject_append_only_change');
  expect(normalized).toContain("OLD.execution_status = 'IN_PROGRESS' AND NEW.execution_status = 'SUCCEEDED'");
});
