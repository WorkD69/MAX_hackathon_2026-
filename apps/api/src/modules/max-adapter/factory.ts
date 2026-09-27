import type { RuntimeConfig } from '../../config/types.js';
import { FakeMaxAdapter } from './fake.js';
import { RealMaxAdapter } from './real.js';
import type { MaxFetch, PerChatSendCoordinator } from './real.js';
import type { MaxAdapter } from './types.js';

export function createMaxAdapter(config: RuntimeConfig, sendCoordinator: PerChatSendCoordinator, fetcher?: MaxFetch): MaxAdapter {
  if (config.MAX_ADAPTER_MODE === 'fake') return new FakeMaxAdapter(config);
  return new RealMaxAdapter(config, sendCoordinator, fetcher);
}
