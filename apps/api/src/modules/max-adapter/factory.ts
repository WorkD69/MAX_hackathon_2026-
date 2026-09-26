import type { RuntimeConfig } from '../../config/types.js';
import { FakeMaxAdapter } from './fake.js';
import { RealMaxAdapter } from './real.js';
import type { MaxFetch } from './real.js';
import type { MaxAdapter } from './types.js';

export function createMaxAdapter(config: RuntimeConfig, fetcher?: MaxFetch): MaxAdapter {
  if (config.MAX_ADAPTER_MODE === 'fake') return new FakeMaxAdapter(config);
  return new RealMaxAdapter(config, fetcher);
}
