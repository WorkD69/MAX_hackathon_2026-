import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { PlatformProvider } from '../platform/platform-context.js';
import type { PlatformAdapter } from '../platform/platform-adapter.js';
import { queryClient } from './query-client.js';

interface AppProvidersProps {
  readonly children: ReactNode;
  readonly adapter?: PlatformAdapter;
}

export function AppProviders({ children, adapter }: AppProvidersProps) {
  return (
    <PlatformProvider {...(adapter ? { adapter } : {})}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </PlatformProvider>
  );
}
