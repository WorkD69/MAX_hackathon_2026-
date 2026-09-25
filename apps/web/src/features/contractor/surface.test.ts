import { expect, test } from 'vitest';
import { contractorSurface } from './surface.js';
import { ids, snapshot } from './fixtures.js';

test('selected-only receives no live surface even when a selection exists', () => {
  const value = snapshot({ assignment: null, allowed_actions: [],
    selection: { selection_id: ids.assignment, contractor: { contractor_id: ids.contractor, name: 'A' } } });
  expect(contractorSurface(value).kind).toBe('hidden');
});

test('pending assignment exposes only its exact accept and reject', () => {
  const surface = contractorSurface(snapshot());
  expect(surface.kind).toBe('pending');
  if (surface.kind === 'pending') {
    expect(surface.accept?.target.assignment_id).toBe(ids.assignment);
    expect(surface.reject?.target.assignment_id).toBe(ids.assignment);
  }
});

test('accepted current executor keeps same assignment across N to N+1', () => {
  const value = snapshot({ state: 'REWORK', current_iteration: { iteration_id: ids.iteration, number: 2 },
    assignment: { assignment_id: ids.assignment, contractor: { contractor_id: ids.contractor, name: 'A' }, decision: 'ACCEPTED' },
    current_executor: { contractor_id: ids.contractor, name: 'A' },
    allowed_actions: [{ code: 'SUBMIT_RESULT', target: { assignment_id: ids.assignment,
      iteration_id: ids.iteration }, input: {} }],
  });
  const surface = contractorSurface(value);
  expect(surface.kind).toBe('current');
  if (surface.kind === 'current') {
    expect(surface.iteration.number).toBe(2);
    expect(surface.submit?.target.assignment_id).toBe(ids.assignment);
    expect(surface.accept).toBeUndefined();
  }
});

test('A loses live surface and B remains pending on N+1 without another increment', () => {
  const old = snapshot({ state: 'REWORK', current_iteration: { iteration_id: ids.iteration, number: 2 },
    assignment: { assignment_id: ids.assignment, contractor: { contractor_id: ids.contractor, name: 'A' }, decision: 'ACCEPTED' },
    current_executor: null, allowed_actions: [] });
  expect(contractorSurface(old).kind).toBe('hidden');
  const next = snapshot({ current_iteration: { iteration_id: ids.iteration, number: 2 } });
  expect(contractorSurface(next).kind).toBe('pending');
  expect(next.case.current_iteration.number).toBe(2);
});

test('B becomes current only after accepting its new assignment; iteration stays N+1', () => {
  const contractorB = '55555555-5555-4555-8555-555555555555';
  const assignmentB = '66666666-6666-4666-8666-666666666666';
  const pending = snapshot({ current_iteration: { iteration_id: ids.iteration, number: 2 },
    assignment: { assignment_id: assignmentB,
      contractor: { contractor_id: contractorB, name: 'Подрядчик B' }, decision: 'PENDING' },
    allowed_actions: [{ code: 'ACCEPT_ASSIGNMENT', target: { assignment_id: assignmentB }, input: {} }],
  });
  expect(contractorSurface(pending).kind).toBe('pending');
  const accepted = snapshot({ ...pending.case,
    assignment: { assignment_id: assignmentB,
      contractor: { contractor_id: contractorB, name: 'Подрядчик B' }, decision: 'ACCEPTED' },
    current_executor: { contractor_id: contractorB, name: 'Подрядчик B' },
    allowed_actions: [{ code: 'SUBMIT_RESULT',
      target: { assignment_id: assignmentB, iteration_id: ids.iteration }, input: {} }],
  });
  const surface = contractorSurface(accepted);
  expect(surface.kind).toBe('current');
  if (surface.kind === 'current') {
    expect(surface.iteration.number).toBe(2);
    expect(surface.submit?.target.assignment_id).toBe(assignmentB);
  }
});
