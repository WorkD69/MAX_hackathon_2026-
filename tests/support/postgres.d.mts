import type { MigrationResultSet } from 'kysely';

export interface TestDatabaseReceipt {
  readonly version: 1;
  readonly suite: 'tg026' | 'tg005' | 'tg006';
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
export function requireTestProvisioning(env?: Readonly<Record<string, string | undefined>>): void;
export function validateReceipt(receipt: unknown): asserts receipt is TestDatabaseReceipt;
export function ownershipMarker(receipt: TestDatabaseReceipt): string;
export function assertOwnedResource(receipt: TestDatabaseReceipt, kind: 'database' | 'migrationRole' | 'runtimeRole', row?: { oid: number; marker: string; owner?: number }): void;
export function provisionPostgres(options: ProvisionOptions): Promise<PostgresTestTarget>;
export function cleanupPostgres(options: ProvisionOptions, receipt: TestDatabaseReceipt): Promise<void>;
export function verifyOwnedPostgresConnection(options: ProvisionOptions, receipt: TestDatabaseReceipt, connectionUrl: string): Promise<void>;
export function withDisposablePostgres<T>(options: ProvisionOptions, callback: (target: PostgresTestTarget) => Promise<T>): Promise<T>;
