import type { MigrationResultSet } from 'kysely';

export interface TestDatabaseReceipt {
  readonly version: 1;
  readonly suite: 'tg026' | 'tg005' | 'tg006' | 'tg007' | 'tg008' | 'tg012' | 'tg013' | 'tg013_seam' | 'tg015_auth' | 'tg019';
  readonly legacyKey?: (typeof LEGACY_TEST_TARGETS)[number]['key'];
  readonly runId: string;
  readonly ownerToken: string;
  readonly systemIdentifier: string;
  readonly provisionerOid: number;
  readonly database: string;
  readonly databaseOid: number | null;
  readonly migrationRole: string;
  readonly migrationRoleOid: number | null;
  readonly runtimeRole: string;
  readonly runtimeRoleOid: number | null;
}
export interface ProvisionOptions {
  adminUrl: string;
  env?: Readonly<Record<string, string | undefined>>;
  suite?: TestDatabaseReceipt['suite'];
  legacyKey?: (typeof LEGACY_TEST_TARGETS)[number]['key'];
  receiptPath?: string;
}
export interface PostgresTestTarget {
  readonly receipt: Readonly<TestDatabaseReceipt>;
  readonly receiptPath: string;
  readonly migrationUrl: string;
  readonly runtimeUrl: string;
  preflight(): Promise<{
    systemIdentifier: string;
    principals: Array<{ db: string; principal: string; isolation: string; version: string }>;
  }>;
  migrate(): Promise<MigrationResultSet>;
  cleanup(): Promise<void>;
}
export const LEGACY_TEST_TARGETS: ReadonlyArray<Readonly<{
  key: 'TG005_FOUNDATION' | 'TG005_CONSTRAINTS' | 'TG006' | 'TG007' | 'TG008' | 'TG012_KERNEL' | 'TG012_POLICY' | 'TG013' | 'TG013_SEAM' | 'TG015' | 'TG019';
  suite: TestDatabaseReceipt['suite'];
}>>;
export function assertDistinctLegacyTargets(env?: Readonly<Record<string, string | undefined>>): void;
export function verifyOwnedLegacySuite(key: (typeof LEGACY_TEST_TARGETS)[number]['key'], env?: Readonly<Record<string, string | undefined>>): Promise<string>;
export function requireTestProvisioning(env?: Readonly<Record<string, string | undefined>>): void;
export function validateReceipt(receipt: unknown): asserts receipt is TestDatabaseReceipt;
export function ownershipMarker(receipt: TestDatabaseReceipt): string;
export function assertOwnedResource(receipt: TestDatabaseReceipt, kind: 'database' | 'migrationRole' | 'runtimeRole', row?: { oid: number; marker: string; owner?: number }): void;
export function provisionPostgres(options: ProvisionOptions): Promise<PostgresTestTarget>;
export function cleanupPostgres(options: ProvisionOptions, receipt: TestDatabaseReceipt): Promise<void>;
export function verifyOwnedPostgresConnection(options: ProvisionOptions, receipt: TestDatabaseReceipt, connectionUrl: string): Promise<void>;
export function withDisposablePostgres<T>(options: ProvisionOptions, callback: (target: PostgresTestTarget) => Promise<T>): Promise<T>;
