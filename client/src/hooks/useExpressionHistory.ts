import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  expressionApi,
  type FeedParams,
  type HistoryParams,
  type StatsParams,
  type TrendsParams,
} from '../services/expressionApi';
import type { NewExpressionDetection } from '../types/api';

/** Query keys in one place so invalidation can target all expression data at once. */
export const expressionKeys = {
  all: ['expressions'] as const,
  history: (params: HistoryParams) => ['expressions', 'history', params] as const,
  feed: (params: FeedParams) => ['expressions', 'feed', params] as const,
  stats: (params: StatsParams) => ['expressions', 'stats', params] as const,
  trends: (params: TrendsParams) => ['expressions', 'trends', params] as const,
};

/** Server state lives in the TanStack Query cache, not in component state. */
export function useExpressionHistory(params: HistoryParams) {
  return useQuery({
    queryKey: expressionKeys.history(params),
    queryFn: ({ signal }) => expressionApi.list(params, signal),
    // Keep showing the current page while the next one loads (no flicker).
    placeholderData: keepPreviousData,
  });
}

/**
 * An endless, newest-first history. useInfiniteQuery keeps every loaded page in
 * the cache and asks `getNextPageParam` for the next cursor ("" = first page).
 */
export function useExpressionFeed(params: FeedParams) {
  return useInfiniteQuery({
    queryKey: expressionKeys.feed(params),
    queryFn: ({ pageParam, signal }) => expressionApi.feed(params, pageParam, signal),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function useExpressionStats(params: StatsParams) {
  return useQuery({
    queryKey: expressionKeys.stats(params),
    queryFn: ({ signal }) => expressionApi.stats(params, signal),
  });
}

export function useExpressionTrends(params: TrendsParams) {
  return useQuery({
    queryKey: expressionKeys.trends(params),
    queryFn: ({ signal }) => expressionApi.trends(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useSaveDetection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (detection: NewExpressionDetection) => expressionApi.save(detection),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expressionKeys.all }),
  });
}

export function useDeleteDetection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expressionApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: expressionKeys.all }),
  });
}
