import { ENV_KEYS, inputSchema } from './schema.js';
import type { RuntimeConfig } from './types.js';

export class ConfigValidationError extends Error {
  constructor(readonly issues: ReadonlyArray<{ key: string; reason: string }>) {
    super(`Invalid runtime configuration: ${issues.map(issue => `${issue.key}: ${issue.reason}`).join('; ')}`);
    this.name = 'ConfigValidationError';
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const input: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) input[key] = env[key];
  const result = inputSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigValidationError(result.error.issues.map(issue => ({
      key: String(issue.path[0] ?? 'CONFIG'), reason: issue.code === 'invalid_type' ? 'required or invalid type' : 'invalid',
    })));
  }
  return Object.freeze(result.data);
}
