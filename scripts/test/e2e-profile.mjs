function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`MISSING_${name}`);
  return value;
}

function address(value, name) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`INVALID_${name}`); }
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error(`INVALID_${name}`);
  }
  return value;
}

export function readE2EProfile(env = process.env) {
  const profile = {
    application_base_url: address(required(env, 'APPLICATION_BASE_URL'), 'APPLICATION_BASE_URL'),
    test_auth_demo_profile: required(env, 'TEST_AUTH_DEMO_PROFILE'),
    seed_scenario_ref: required(env, 'SEED_SCENARIO_REF'),
  };
  if (!/^TEST:[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(profile.test_auth_demo_profile)) {
    throw new Error('TEST_ONLY_PROFILE_REQUIRED');
  }
  if (env.API_BASE_URL !== undefined) {
    profile.api_base_url = address(required(env, 'API_BASE_URL'), 'API_BASE_URL');
  }
  return Object.freeze(profile);
}
