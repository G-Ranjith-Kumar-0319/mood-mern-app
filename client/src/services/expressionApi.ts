import type { Expression } from '../constants/expressions';
import type {
  ExpressionDetectionRecord,
  ExpressionStats,
  ExpressionTrends,
  CursorPagination,
  DetectionFeedPage,
  Pagination,
  NewExpressionDetection,
  PaginatedDetections,
  TrendUnit,
} from '../types/api';
import { apiRequest } from './apiClient';

export interface HistoryParams {
  page: number;
  limit: number;
  expression?: Expression;
}

export interface FeedParams {
  limit: number;
  expression?: Expression;
}

export interface StatsParams {
  from?: string;
  to?: string;
}

export interface TrendsParams {
  groupBy: TrendUnit;
  timezone: string;
  from?: string;
}

export const expressionApi = {
  async save(detection: NewExpressionDetection): Promise<ExpressionDetectionRecord> {
    const response = await apiRequest<ExpressionDetectionRecord>('/expressions', {
      method: 'POST',
      body: detection,
    });
    return response.data;
  },

  async list(params: HistoryParams, signal?: AbortSignal): Promise<PaginatedDetections> {
    const response = await apiRequest<ExpressionDetectionRecord[]>('/expressions', {
      query: { page: params.page, limit: params.limit, expression: params.expression },
      signal,
    });
    const pagination = (response.pagination as Pagination | undefined) ?? {
      page: params.page,
      limit: params.limit,
      total: response.data.length,
      totalPages: 1,
    };
    return { items: response.data, pagination };
  },

  /** Cursor ("keyset") pagination: pass the previous page's nextCursor; '' starts at the newest. */
  async feed(params: FeedParams, cursor: string, signal?: AbortSignal): Promise<DetectionFeedPage> {
    const response = await apiRequest<ExpressionDetectionRecord[]>('/expressions', {
      query: { limit: params.limit, expression: params.expression, cursor },
      signal,
    });
    const pagination = response.pagination as CursorPagination | undefined;
    return { items: response.data, nextCursor: pagination?.nextCursor ?? null };
  },

  async stats(params: StatsParams, signal?: AbortSignal): Promise<ExpressionStats> {
    const response = await apiRequest<ExpressionStats>('/expressions/stats', {
      query: { from: params.from, to: params.to },
      signal,
    });
    return response.data;
  },

  async trends(params: TrendsParams, signal?: AbortSignal): Promise<ExpressionTrends> {
    const response = await apiRequest<ExpressionTrends>('/expressions/trends', {
      query: { groupBy: params.groupBy, timezone: params.timezone, from: params.from },
      signal,
    });
    return response.data;
  },

  async remove(id: string): Promise<void> {
    await apiRequest<{ id: string }>(`/expressions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};
