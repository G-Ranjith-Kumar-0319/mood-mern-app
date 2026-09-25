import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../services/apiClient';

const MAX_RETRIES = 2;

function shouldRetry(failureCount: number, error: unknown): boolean {
  // 4xx responses will not succeed on retry; network/5xx errors might.
  if (error instanceof ApiError && error.status < 500) return false;
  return failureCount < MAX_RETRIES;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
