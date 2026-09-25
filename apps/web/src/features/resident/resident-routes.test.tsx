import { act, useEffect } from 'react';
import { MemoryRouter, useLocation, useRoutes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
import { buildAppRoutes, type AppRouteModule } from '../../app/routes.js';
import { renderReactTree } from '../../app/test-render.js';
import { queryClient } from '../../app/query-client.js';
import type { PlatformAdapter } from '../../platform/platform-adapter.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { waitForUi, fillCreateCaseForm } from './test-helpers.js';
import { IDS, createCaseSuccessFixture, createCaseOptionsFixture, residentSnapshot } from './fixtures.js';
import type { ResidentTransport } from './resident-transport.js';
import { createResidentRouteModule } from './resident-routes.js';

const adapter: PlatformAdapter = {
  name: 'test', isMiniAppContext: true, getRawInitData: () => null, subscribeForeground: () => () => {},
};

function residentTransport(overrides: Partial<ResidentTransport> = {}): ResidentTransport {
  return {
    createCaseOptions: vi.fn().mockResolvedValue(createCaseOptionsFixture),
    createCase: vi.fn().mockResolvedValue(createCaseSuccessFixture),
    addComment: vi.fn(), confirmResult: vi.fn(), remarkResult: vi.fn(), downloadCapability: vi.fn(),
    ...overrides,
  } as ResidentTransport;
}

function readTransport(overrides: Partial<CaseReadTransport> = {}): CaseReadTransport {
  return { list: vi.fn(), snapshot: vi.fn().mockResolvedValue(residentSnapshot()), ...overrides } as CaseReadTransport;
}

let seenLocation = '';

function LocationProbe() {
  const location = useLocation();
  useEffect(() => { seenLocation = `${location.pathname}`; }, [location.pathname]);
  return null;
}

function Routed({ module }: { module: AppRouteModule }) {
  return useRoutes(module.routes);
}

function renderRoutes(module: AppRouteModule, path: string) {
  return renderReactTree(
    <MemoryRouter initialEntries={[path]}>
      <LocationProbe />
      <Routed module={module} />
    </MemoryRouter>,
    { adapter });
}

function moduleWith(resident = residentTransport(), read = readTransport(), contextKey = 'ctx-1') {
  return createResidentRouteModule({ residentTransport: resident, readTransport: read, contextKey });
}

afterEach(() => { queryClient.clear(); seenLocation = ''; });

test('module exposes exactly the two resident routes under a stable id', () => {
  const module = moduleWith();
  expect(module.id).toBe('resident');
  expect(module.routes.map((route) => route.path)).toEqual(['resident/cases/new', 'resident/cases/:caseId']);
});

test('module routes are mounted under the app shell by the central router', () => {
  const routes = buildAppRoutes([moduleWith()]);
  const children = routes[0]!.children as { path?: string }[];
  expect(routes[0]!.path).toBe('/');
  expect(children.map((child) => child.path)).toContain('resident/cases/new');
  expect(children.map((child) => child.path)).toContain('resident/cases/:caseId');
});

test('the new-case route renders the create form and navigates to the created case', async () => {
  const resident = residentTransport();
  const read = readTransport();
  const view = renderRoutes(moduleWith(resident, read), '/resident/cases/new');
  try {
    await waitForUi(() => {
      expect(view.container.querySelector('[data-testid="create-case-submit"]')).not.toBeNull();
    });
    expect(read.snapshot).not.toHaveBeenCalled();

    await fillCreateCaseForm(view.container);
    await act(async () => { (view.container.querySelector('[data-testid="create-case-submit"]') as HTMLButtonElement).click(); });
    await waitForUi(() => expect(resident.createCase).toHaveBeenCalledTimes(1));
    await waitForUi(() => expect(seenLocation).toBe(`/resident/cases/${IDS.caseId}`));  } finally { view.unmount(); }
});

test('the case route passes the route param to the read transport', async () => {
  const read = readTransport();
  const view = renderRoutes(moduleWith(residentTransport(), read), '/resident/cases/case-42');
  try {
    await waitForUi(() => {
      expect(view.container.querySelector('[data-testid="resident-case-status"]')).not.toBeNull();
    });
    expect(read.snapshot).toHaveBeenCalledWith('case-42', 'RESIDENT');
  } finally { view.unmount(); }
});

test('a case id with url-sensitive characters reaches the transport decoded', async () => {
  const read = readTransport();
  const view = renderRoutes(moduleWith(residentTransport(), read), '/resident/cases/case%2F42');
  try {
    await waitForUi(() => expect(read.snapshot).toHaveBeenCalled());
    expect(read.snapshot).toHaveBeenCalledWith('case/42', 'RESIDENT');
  } finally { view.unmount(); }
});

test('routes never depend on a session hook or a global fetch', async () => {
  const fetchSpy = vi.fn();
  const original = globalThis.fetch;
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  const view = renderRoutes(moduleWith(), '/resident/cases/' + IDS.caseId);
  try {
    await waitForUi(() => expect(fetchSpy).toHaveBeenCalledTimes(0));
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    globalThis.fetch = original;
  }
});
