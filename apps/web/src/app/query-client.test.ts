import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import { QUERY_CLIENT_OPTIONS, createQueryClient, queryClient } from './query-client.js';

test('TG-004 QueryClient policy matches pinned defaults', () => {
  expect(QUERY_CLIENT_OPTIONS).toEqual({
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
  });
  const client = createQueryClient();
  expect(client).toBeInstanceOf(QueryClient);
  expect(client.getDefaultOptions()).toEqual(QUERY_CLIENT_OPTIONS.defaultOptions);
  expect(client).not.toBe(queryClient);
});

test('TG-004 exported QueryClient is a singleton with pinned policy', () => {
  expect(queryClient).toBeInstanceOf(QueryClient);
  expect(queryClient.getDefaultOptions()).toEqual(QUERY_CLIENT_OPTIONS.defaultOptions);
});
