import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Migration } from 'kysely/migration';
import * as caseWorkflow from '../dist/migrations/0002_case_workflow.js';
import { expect, expectTypeOf, test } from 'vitest';

test('TG-006 case-workflow migration exports up and down as migration functions', () => {
  expect(typeof caseWorkflow.up).toBe('function');
  expect(typeof caseWorkflow.down).toBe('function');
  expectTypeOf(caseWorkflow).toMatchTypeOf<Migration>();
});

test('TG-006 case-workflow migration declares exactly 8 CREATE TABLE statements', async () => {
  const text = await fs.readFile(new URL('../migrations/0002_case_workflow.ts', import.meta.url), 'utf8');
  const createTableCount = (text.match(/\bCREATE TABLE\b/g) ?? []).length;
  expect(createTableCount).toBe(8);
});

test('TG-006 case-workflow migration declares exact partial unique indexes with predicates', async () => {
  const text = await fs.readFile(new URL('../migrations/0002_case_workflow.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  expect(normalized).toContain("CREATE UNIQUE INDEX uq_case_display_number ON case_table (display_number) WHERE display_number IS NOT NULL");
  expect(normalized).toContain("CREATE UNIQUE INDEX uq_evt015_per_result ON case_event (result_id, event_type) WHERE event_type = 'EVT_015'");
  expect(normalized).toContain('CONSTRAINT uq_case_demo_run_case UNIQUE (demo_run_id, case_id)');
});

test('TG-006 migration contains deferred circular FK declarations', async () => {
  const text = await fs.readFile(new URL('../migrations/0002_case_workflow.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  expect(normalized).toContain('DEFERRABLE INITIALLY DEFERRED');
  expect(normalized).toContain('fk_case_current_iteration');
  expect(normalized).toContain('fk_event_iteration_id');
  expect(normalized).toContain('fk_iteration_started_by_event_id');
  expect(normalized).toContain('fk_demo_run_primary_case');
});

test('TG-006 migration uses triggers only for immutability, not lifecycle transitions', async () => {
  const text = await fs.readFile(new URL('../migrations/0002_case_workflow.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  const triggerMatches = normalized.match(/CREATE TRIGGER/g) ?? [];
  expect(triggerMatches.length).toBe(3);
  expect(normalized).toContain('tg006_reject_immutable_change');
  expect(normalized).toContain('tg006_guard_assignment');
  expect(normalized).toContain('tg006_guard_case_origin');
  expect(normalized).toContain('CREATE TABLE case_table');
  expect(normalized).toContain('CREATE TABLE case_iteration');
  expect(normalized).toContain('CREATE TABLE contractor_selection');
  expect(normalized).toContain('CREATE TABLE assignment');
  expect(normalized).toContain('CREATE TABLE result');
  expect(normalized).toContain('CREATE TABLE resident_feedback');
  expect(normalized).toContain('CREATE TABLE comment');
  expect(normalized).toContain('CREATE TABLE case_event');
});

test('TG-006 migration has no command_id/attachment_id FK on case_event', async () => {
  const text = await fs.readFile(new URL('../migrations/0002_case_workflow.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  expect(normalized).not.toContain('command_id) REFERENCES');
  expect(normalized).not.toContain('attachment_id) REFERENCES');
});

test('TG-006 closed-domain CHECK constraints exist with exact values', async () => {
  const text = await fs.readFile(new URL('../migrations/0002_case_workflow.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  expect(normalized).toContain("ck_case_current_state CHECK (current_state IN ('CREATED','ACCEPTED_BY_UK','SENT_TO_CONTRACTOR','EXECUTION','AWAITING_RESULT_CHECK','REMARKS_REVIEW','REWORK','COMPLETED')");
  expect(normalized).toContain("ck_case_result_requirement_snapshot CHECK (result_requirement_snapshot IN ('NONE','PHOTO','FILE')");
  expect(normalized).toContain("ck_case_closure_kind CHECK (closure_kind IS NULL OR closure_kind IN ('CONFIRMED_RESULT','NO_RESIDENT_FEEDBACK','DISPUTED_WITH_EXPLANATION')");
  expect(normalized).toContain("ck_case_closure_consistency CHECK");
  expect(normalized).toContain("ck_iteration_start_reason CHECK (start_reason IN ('INITIAL','REWORK')");
  expect(normalized).toContain("ck_comment_kind CHECK (comment_kind IN ('WORKING','CLARIFICATION_REQUEST','CLARIFICATION_REPLY')");
  expect(normalized).toContain("ck_comment_actor_role_snapshot CHECK (actor_role_snapshot IN ('RESIDENT','UK_EMPLOYEE','UK_ADMIN','CONTRACTOR_EMPLOYEE')");
  expect(normalized).toContain("ck_event_type CHECK (event_type IN ('EVT_001','EVT_002','EVT_003','EVT_004','EVT_005','EVT_006','EVT_007','EVT_008','EVT_009','EVT_010','EVT_011','EVT_012','EVT_013','EVT_014','EVT_015','EVT_016','EVT_017')");
  expect(normalized).toContain("ck_event_actor_role_snapshot CHECK (actor_role_snapshot IS NULL OR actor_role_snapshot IN ('RESIDENT','UK_EMPLOYEE','UK_ADMIN','CONTRACTOR_EMPLOYEE')");
  expect(normalized).toContain("ck_event_from_state CHECK (from_state IS NULL OR from_state IN (");
  expect(normalized).toContain("ck_event_to_state CHECK (to_state IS NULL OR to_state IN (");
  expect(normalized).toContain("ck_feedback_type CHECK (type IN ('CONFIRMATION','REMARK')");
  expect(normalized).toContain("ck_feedback_remark CHECK");
});

test('TG-006 ck_feedback_remark canonical semantics: CONFIRMATION + NULL or empty valid, non-empty invalid', async () => {
  const text = await fs.readFile(new URL('../migrations/0002_case_workflow.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  expect(normalized).toContain("remark_text IS NULL OR remark_text = ''");
  expect(normalized).toContain("type = 'REMARK' AND length(remark_text) > 0");
});

test('TG-006 assignment decision CHECK enforces one-way PENDING transition', async () => {
  const text = await fs.readFile(new URL('../migrations/0002_case_workflow.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  expect(normalized).toContain("ck_assignment_decision CHECK");
  expect(normalized).toContain("decision_status = 'PENDING'");
  expect(normalized).toContain("decision_status = 'ACCEPTED'");
  expect(normalized).toContain("decision_status = 'REJECTED'");
});

test('TG-006 ck_case_closure_consistency enforces DISPUTED_WITH_EXPLANATION requires non-empty explanation', async () => {
  const text = await fs.readFile(new URL('../migrations/0002_case_workflow.ts', import.meta.url), 'utf8');
  const normalized = text.replace(/\s+/g, ' ');
  expect(normalized).toContain("closure_explanation IS NOT NULL AND btrim(closure_explanation) <> ''");
});
