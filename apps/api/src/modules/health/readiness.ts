export interface ReadinessSnapshot {
  readonly databaseReachable: boolean;
  readonly migrationsCurrent: boolean;
  readonly applicationInitialized: boolean;
}

export interface ReadinessProbe {
  snapshot(): ReadinessSnapshot | Promise<ReadinessSnapshot>;
}

export const defaultReadinessProbe: ReadinessProbe = Object.freeze({
  snapshot: () => ({ databaseReachable: false, migrationsCurrent: false, applicationInitialized: false }),
});
