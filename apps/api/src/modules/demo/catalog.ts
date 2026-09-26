import type { Role } from '@max-smart-city/db';

export interface CatalogActor {
  readonly role: Role;
  readonly actorAlias: string;
  readonly appUserId: string;
}

// TG-008 owns this catalog and its source entry point (also used by its seed CLI).
// Source and compiled API modules have the same depth below the repository root.
const seed = await import(new URL('../../../../../packages/db/src/seed/index.ts', import.meta.url).href) as {
  DEMO_ACTOR_ALLOWLIST: readonly CatalogActor[];
  DEFAULT_CONTRACTOR_ACTOR: CatalogActor;
};
export const demoActors = seed.DEMO_ACTOR_ALLOWLIST;
export const defaultContractorActor = seed.DEFAULT_CONTRACTOR_ACTOR;
