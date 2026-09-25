import type { Expression } from '../constants/expressions';

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  pagination?: Pagination | CursorPagination;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; details?: Array<{ path: string; message: string }> };
}

export interface ExpressionDetectionRecord {
  id: string;
  expression: Expression;
  confidence: number;
  detectedAt: string;
  durationMs: number | null;
  source: string;
  createdAt: string;
}

export interface NewExpressionDetection {
  expression: Expression;
  confidence: number;
  detectedAt: string;
  durationMs?: number;
}

export interface CursorPagination {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface DetectionFeedPage {
  items: ExpressionDetectionRecord[];
  nextCursor: string | null;
}

export interface PaginatedDetections {
  items: ExpressionDetectionRecord[];
  pagination: Pagination;
}

export interface ExpressionStatItem {
  expression: Expression;
  count: number;
  percentage: number;
  averageConfidence: number;
  totalDurationMs: number;
}

export interface ExpressionStats {
  total: number;
  from: string | null;
  to: string | null;
  byExpression: ExpressionStatItem[];
}

export type TrendUnit = 'hour' | 'day' | 'week' | 'month';

export interface TrendPoint {
  period: string;
  total: number;
  counts: Record<Expression, number>;
}

export interface ExpressionTrends {
  groupBy: TrendUnit;
  timezone: string;
  from: string | null;
  to: string | null;
  series: TrendPoint[];
}

export const RETENTION_OPTIONS = [7, 30, 90, 365] as const;
export type RetentionDays = (typeof RETENTION_OPTIONS)[number] | null;

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  /** Detections are deleted automatically after this many days (null = kept). */
  retentionDays: number | null;
}
