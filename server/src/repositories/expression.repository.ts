import type { ClientSession, QueryFilter, Types } from 'mongoose';
import type { Expression } from '../constants/expressions.js';
import type { CursorPosition } from '../utils/cursor.js';
import type { TrendUnit } from '../utils/timeBuckets.js';
import {
  ExpressionDetectionModel,
  type ExpressionDetection,
} from '../models/expressionDetection.model.js';

/** The session's user, or null for anonymous requests. */
export type OwnerId = Types.ObjectId | null;

export interface NewDetection {
  ownerId: OwnerId;
  expression: Expression;
  confidence: number;
  detectedAt: Date;
  durationMs?: number;
  /** Delete automatically this many days after detectedAt (null = keep). */
  retentionDays: number | null;
}

export interface DetectionQuery {
  ownerId: OwnerId;
  expression?: Expression;
  from?: Date;
  to?: Date;
  skip: number;
  limit: number;
}

export interface ExpressionCountRow {
  _id: Expression;
  count: number;
  averageConfidence: number;
  totalDurationMs: number;
}

export interface PeriodCountRow {
  _id: { period: Date; expression: Expression };
  count: number;
}

/** History order. `_id` breaks ties between equal timestamps so every order is total. */
const NEWEST_FIRST = { detectedAt: -1, _id: -1 } as const;

/** Only the fields the API returns — never ship more data than needed over the wire. */
const PUBLIC_PROJECTION = {
  expression: 1,
  confidence: 1,
  detectedAt: 1,
  durationMs: 1,
  source: 1,
  createdAt: 1,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function expiryFor(detectedAt: Date, retentionDays: number | null): Date | null {
  return retentionDays === null ? null : new Date(detectedAt.getTime() + retentionDays * DAY_MS);
}

function dateRange(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from && { $gte: from }), ...(to && { $lte: to }) };
}

function buildFilter(
  query: Pick<DetectionQuery, 'ownerId' | 'expression' | 'from' | 'to'>,
): QueryFilter<ExpressionDetection> {
  const detectedAt = dateRange(query.from, query.to);
  return {
    userId: query.ownerId,
    ...(query.expression && { expression: query.expression }),
    ...(detectedAt && { detectedAt }),
  };
}

/** Data access only — no HTTP or business rules here. */
export const expressionRepository = {
  async create(input: NewDetection): Promise<ExpressionDetection> {
    const document = await ExpressionDetectionModel.create({
      userId: input.ownerId,
      expression: input.expression,
      confidence: input.confidence,
      detectedAt: input.detectedAt,
      durationMs: input.durationMs ?? null,
      source: 'camera',
      expiresAt: expiryFor(input.detectedAt, input.retentionDays),
    });
    return document.toObject();
  },

  async findMany(query: DetectionQuery): Promise<{ items: ExpressionDetection[]; total: number }> {
    const filter = buildFilter(query);
    // Two independent queries run concurrently (not one after another).
    const [items, total] = await Promise.all([
      ExpressionDetectionModel.find(filter, PUBLIC_PROJECTION)
        .sort(NEWEST_FIRST)
        .skip(query.skip)
        .limit(query.limit)
        .lean<ExpressionDetection[]>(),
      ExpressionDetectionModel.countDocuments(filter),
    ]);
    return { items, total };
  },

  /**
   * Keyset ("cursor") pagination: instead of skipping N documents, continue right
   * after the last one the client saw. Cost stays constant however deep the page.
   * Fetches one extra document to learn whether more exist.
   */
  async findAfter(
    query: Omit<DetectionQuery, 'skip'> & { after?: CursorPosition },
  ): Promise<{ items: ExpressionDetection[]; hasMore: boolean }> {
    const filter = buildFilter(query);
    if (query.after) {
      const { detectedAt, id } = query.after;
      filter.$or = [{ detectedAt: { $lt: detectedAt } }, { detectedAt, _id: { $lt: id } }];
    }
    const items = await ExpressionDetectionModel.find(filter, PUBLIC_PROJECTION)
      .sort(NEWEST_FIRST)
      .limit(query.limit + 1)
      .lean<ExpressionDetection[]>();
    return { items: items.slice(0, query.limit), hasMore: items.length > query.limit };
  },

  findOwnedById(id: string, ownerId: OwnerId): Promise<ExpressionDetection | null> {
    return ExpressionDetectionModel.findOne({ _id: id, userId: ownerId }, PUBLIC_PROJECTION)
      .lean<ExpressionDetection>()
      .exec();
  },

  async deleteOwnedById(id: string, ownerId: OwnerId): Promise<boolean> {
    const result = await ExpressionDetectionModel.deleteOne({ _id: id, userId: ownerId });
    return result.deletedCount === 1;
  },

  /** Counting happens inside MongoDB; Node never loads the individual documents. */
  countByExpression(query: {
    ownerId: OwnerId;
    from?: Date;
    to?: Date;
  }): Promise<ExpressionCountRow[]> {
    return ExpressionDetectionModel.aggregate<ExpressionCountRow>([
      { $match: buildFilter(query) },
      {
        $group: {
          _id: '$expression',
          count: { $sum: 1 },
          averageConfidence: { $avg: '$confidence' },
          totalDurationMs: { $sum: { $ifNull: ['$durationMs', 0] } },
        },
      },
      { $sort: { count: -1, _id: 1 } },
    ]).exec();
  },

  /** Streams every detection of an owner (oldest first) without loading them all into memory. */
  streamForOwner(ownerId: Types.ObjectId) {
    return ExpressionDetectionModel.find({ userId: ownerId }, PUBLIC_PROJECTION)
      .sort({ detectedAt: 1 })
      .lean<ExpressionDetection>()
      .cursor();
  },

  async deleteAllForOwner(ownerId: Types.ObjectId, session?: ClientSession): Promise<number> {
    const result = await ExpressionDetectionModel.deleteMany({ userId: ownerId }, { session });
    return result.deletedCount;
  },

  /**
   * Re-computes expiry for all of an owner's detections in one server-side update
   * (an aggregation-pipeline update: no documents travel to Node).
   */
  async applyRetention(ownerId: Types.ObjectId, retentionDays: number | null): Promise<void> {
    await ExpressionDetectionModel.updateMany(
      { userId: ownerId },
      [
        {
          $set: {
            expiresAt:
              retentionDays === null
                ? null
                : { $dateAdd: { startDate: '$detectedAt', unit: 'day', amount: retentionDays } },
          },
        },
      ],
      // Mongoose 9 requires an explicit opt-in for aggregation-pipeline updates.
      { updatePipeline: true },
    );
  },

  /** Counts per (time bucket, expression). Bucketing happens in MongoDB with $dateTrunc. */
  countByPeriod(query: {
    ownerId: OwnerId;
    from?: Date;
    to?: Date;
    unit: TrendUnit;
    timezone: string;
  }): Promise<PeriodCountRow[]> {
    return ExpressionDetectionModel.aggregate<PeriodCountRow>([
      { $match: buildFilter(query) },
      {
        $group: {
          _id: {
            period: {
              $dateTrunc: {
                date: '$detectedAt',
                unit: query.unit,
                timezone: query.timezone,
                startOfWeek: 'monday',
              },
            },
            expression: '$expression',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.period': 1 } },
    ]).exec();
  },
};
