import { QueryClient } from '@tanstack/react-query';

export const QUERY_CLIENT_OPTIONS = {
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
      retry: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: { retry: false },
  },
} as const;

export function createQueryClient(): QueryClient {
  return new QueryClient(QUERY_CLIENT_OPTIONS);
}

export const queryClient: QueryClient = createQueryClient();
