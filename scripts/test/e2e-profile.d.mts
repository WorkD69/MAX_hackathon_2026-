export interface E2EProfile {
  readonly application_base_url: string;
  readonly api_base_url?: string;
  readonly test_auth_demo_profile: string;
  readonly seed_scenario_ref: string;
}
export function readE2EProfile(env?: Readonly<Record<string, string | undefined>>): Readonly<E2EProfile>;
