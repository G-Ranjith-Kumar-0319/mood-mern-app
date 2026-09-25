import { config } from '../config/env.js';
import { SUPPORTED_EXPRESSIONS, type Expression } from '../constants/expressions.js';
import type { ExpressionDetection } from '../models/expressionDetection.model.js';
import { detectionsSaved } from '../observability/metrics.js';
import {
  expressionRepository,
  type ExpressionCountRow,
  type OwnerId,
  type PeriodCountRow,
} from '../repositories/expression.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import type {
  CreateExpressionInput,
  ListExpressionsQuery,
  StatsQuery,
  TrendsQuery,
} from '../schemas/expression.schema.js';
import { AppError } from '../utils/AppError.js';
import { buildPagination, type CursorPagination, type Pagination } from '../utils/apiResponse.js';
import { encodeCursor } from '../utils/cursor.js';
import { bucketRange, truncateToBucket, type TrendUnit } from '../utils/timeBuckets.js';

/** Upper bound on points in one trend series (e.g. ~13 months of days). */
export const MAX_TREND_BUCKETS = 400;

/** Public shape of a detection. Internal fields (userId, _id) never leave the API. */
export interface ExpressionDetectionDto {
  id: string;
  expression: Expression;
  confidence: number;
  detectedAt: string;
  durationMs: number | null;
  source: string;
  createdAt: string;
}

export interface ExpressionStatItem {
  expression: Expression;
  count: number;
  /** Share of all detections in the range, 0–100 with one decimal. */
  percentage: number;
  averageConfidence: number;
  totalDurationMs: number;
}

export interface ExpressionStatsDto {
  total: number;
  from: string | null;
  to: string | null;
  byExpression: ExpressionStatItem[];
}

export interface TrendPoint {
  /** Start of the bucket (ISO, UTC). */
  period: string;
  total: number;
  counts: Record<Expression, number>;
}

export interface ExpressionTrendsDto {
  groupBy: TrendUnit;
  timezone: string;
  from: string | null;
  to: string | null;
  series: TrendPoint[];
}

const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export function toDetectionDto(document: ExpressionDetection): ExpressionDetectionDto {
  return {
    id: document._id.toString(),
    expression: document.expression,
    confidence: document.confidence,
    detectedAt: document.detectedAt.toISOString(),
    durationMs: document.durationMs ?? null,
    source: document.source,
    createdAt: document.createdAt.toISOString(),
  };
}

/**
 * Turns MongoDB's grouped counts into the API response. Every supported
 * expression is present (zero-filled) so charts have a stable set of bars.
 */
export function buildStats(
  rows: readonly ExpressionCountRow[],
  range: { from?: Date; to?: Date },
): ExpressionStatsDto {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const byExpression = new Map(rows.map((row) => [row._id, row]));

  const items = SUPPORTED_EXPRESSIONS.map((expression): ExpressionStatItem => {
    const row = byExpression.get(expression);
    return {
      expression,
      count: row?.count ?? 0,
      percentage: total > 0 && row ? roundTo((row.count / total) * 100, 1) : 0,
      averageConfidence: row ? roundTo(row.averageConfidence, 3) : 0,
      totalDurationMs: row?.totalDurationMs ?? 0,
    };
  }).sort((a, b) => b.count - a.count || a.expression.localeCompare(b.expression));

  return {
    total,
    from: range.from?.toISOString() ?? null,
    to: range.to?.toISOString() ?? null,
    byExpression: items,
  };
}

const emptyCounts = (): Record<Expression, number> =>
  Object.fromEntries(SUPPORTED_EXPRESSIONS.map((expression) => [expression, 0])) as Record<
    Expression,
    number
  >;

/**
 * Shapes per-(bucket, expression) counts into a gap-free series: every bucket
 * between the start and end appears, with zeros where nothing was detected, so
 * a time axis never silently skips empty periods.
 */
export function buildTrends(
  rows: readonly PeriodCountRow[],
  query: TrendsQuery,
  now: Date = new Date(),
): ExpressionTrendsDto {
  const { groupBy, timezone, from, to } = query;
  const base = {
    groupBy,
    timezone,
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
  };

  const firstRow = rows[0];
  if (!from && !firstRow) return { ...base, series: [] };

  const first = truncateToBucket(from ?? firstRow!._id.period, groupBy, timezone);
  const last = truncateToBucket(to ?? now, groupBy, timezone);
  const buckets = bucketRange(first, last, groupBy, timezone, MAX_TREND_BUCKETS);
  if (!buckets) {
    throw AppError.validation(
      `Range too long for groupBy=${groupBy} (max ${MAX_TREND_BUCKETS} periods). Use a coarser unit or a shorter range.`,
    );
  }

  const byPeriod = new Map<number, TrendPoint>(
    buckets.map((bucket) => [
      bucket.getTime(),
      { period: bucket.toISOString(), total: 0, counts: emptyCounts() },
    ]),
  );
  for (const row of rows) {
    const point = byPeriod.get(row._id.period.getTime());
    if (!point) continue;
    point.counts[row._id.expression] += row.count;
    point.total += row.count;
  }
  return { ...base, series: [...byPeriod.values()] };
}

export const expressionService = {
  async record(ownerId: OwnerId, input: CreateExpressionInput): Promise<ExpressionDetectionDto> {
    const retentionDays = ownerId
      ? ((await userRepository.findById(ownerId))?.retentionDays ?? null)
      : config.retention.anonymousDays;
    const created = await expressionRepository.create({ ownerId, ...input, retentionDays });
    detectionsSaved.inc({ expression: created.expression });
    return toDetectionDto(created);
  },

  async list(
    ownerId: OwnerId,
    query: ListExpressionsQuery,
  ): Promise<{ items: ExpressionDetectionDto[]; pagination: Pagination | CursorPagination }> {
    const { limit, expression, from, to, cursor } = query;
    if (cursor !== undefined) {
      const { items, hasMore } = await expressionRepository.findAfter({
        ownerId,
        expression,
        from,
        to,
        limit,
        after: cursor === '' ? undefined : cursor,
      });
      const last = items.at(-1);
      return {
        items: items.map(toDetectionDto),
        pagination: {
          limit,
          hasMore,
          nextCursor:
            hasMore && last ? encodeCursor({ detectedAt: last.detectedAt, id: last._id }) : null,
        },
      };
    }

    const page = query.page ?? 1;
    const { items, total } = await expressionRepository.findMany({
      ownerId,
      expression,
      from,
      to,
      skip: (page - 1) * limit,
      limit,
    });
    return { items: items.map(toDetectionDto), pagination: buildPagination(page, limit, total) };
  },

  async getById(ownerId: OwnerId, id: string): Promise<ExpressionDetectionDto> {
    // Scoping by owner means another user's id is indistinguishable from a missing one (no enumeration).
    const found = await expressionRepository.findOwnedById(id, ownerId);
    if (!found) throw AppError.notFound('Detection not found');
    return toDetectionDto(found);
  },

  async remove(ownerId: OwnerId, id: string): Promise<void> {
    const deleted = await expressionRepository.deleteOwnedById(id, ownerId);
    if (!deleted) throw AppError.notFound('Detection not found');
  },

  async stats(ownerId: OwnerId, query: StatsQuery): Promise<ExpressionStatsDto> {
    const rows = await expressionRepository.countByExpression({ ownerId, ...query });
    return buildStats(rows, query);
  },

  async trends(ownerId: OwnerId, query: TrendsQuery): Promise<ExpressionTrendsDto> {
    const rows = await expressionRepository.countByPeriod({
      ownerId,
      from: query.from,
      to: query.to,
      unit: query.groupBy,
      timezone: query.timezone,
    });
    return buildTrends(rows, query);
  },
};
