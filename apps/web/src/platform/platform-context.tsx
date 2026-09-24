import { createContext, useContext, type ReactNode } from 'react';
import { createPlatformAdapter, type PlatformAdapter } from './platform-adapter.js';

const defaultAdapter = createPlatformAdapter();
export const PlatformContext = createContext<PlatformAdapter>(defaultAdapter);

interface PlatformProviderProps {
  readonly adapter?: PlatformAdapter;
  readonly children: ReactNode;
}

export function PlatformProvider({ adapter, children }: PlatformProviderProps) {
  return (
    <PlatformContext.Provider value={adapter ?? defaultAdapter}>
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformAdapter {
  return useContext(PlatformContext);
}
