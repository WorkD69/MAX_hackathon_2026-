import type { ColumnType, Generated } from 'kysely';
import type {
  AppUserTable,
  CategoryTable,
  DB,
  Database,
  DemoRunStatus,
  MaxIdentityLinkStatus,
  ResultRequirement,
  Role,
} from './index.js';

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type _DbKeysExact = Expect<
  Equal<
    keyof Database,
    | 'organization'
    | 'house'
    | 'premises'
    | 'app_user'
    | 'user_role_binding'
    | 'resident_premises_access'
    | 'uk_house_access'
    | 'max_identity'
    | 'category'
    | 'contractor'
    | 'organization_contractor'
    | 'demo_run'
    | 'demo_run_actor'
  >
>;
type _DbAliasExact = Expect<Equal<DB, Database>>;
type _RoleClosed = Expect<Equal<Role, 'RESIDENT' | 'UK_EMPLOYEE' | 'UK_ADMIN' | 'CONTRACTOR_EMPLOYEE'>>;
type _ResultRequirementClosed = Expect<Equal<ResultRequirement, 'NONE' | 'PHOTO' | 'FILE'>>;
type _DemoRunStatusClosed = Expect<Equal<DemoRunStatus, 'ACTIVE' | 'ARCHIVED'>>;
type _MaxIdentityLinkStatusClosed = Expect<Equal<MaxIdentityLinkStatus, 'UNLINKED' | 'LINKED_CONFIRMED'>>;
type _ConfigRevisionType = Expect<Equal<CategoryTable['config_revision'], ColumnType<string, number | string, number | string>>>;
type _IsSyntheticType = Expect<Equal<AppUserTable['is_synthetic'], Generated<boolean>>>;

export type TypecheckGate<
  TDbKeys extends true,
  TDbAlias extends true,
  TRole extends true,
  TResultRequirement extends true,
  TDemoRunStatus extends true,
  TLinkStatus extends true,
  TConfigRevision extends true,
  TIsSynthetic extends true,
> = [
  TDbKeys,
  TDbAlias,
  TRole,
  TResultRequirement,
  TDemoRunStatus,
  TLinkStatus,
  TConfigRevision,
  TIsSynthetic,
];

export type GateResult = TypecheckGate<
  _DbKeysExact,
  _DbAliasExact,
  _RoleClosed,
  _ResultRequirementClosed,
  _DemoRunStatusClosed,
  _MaxIdentityLinkStatusClosed,
  _ConfigRevisionType,
  _IsSyntheticType
>;