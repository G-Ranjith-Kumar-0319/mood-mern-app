import { z } from 'zod';
import {
  DETECTION_SOURCES,
  MAX_CLOCK_SKEW_MS,
  MAX_DETECTION_DURATION_MS,
  PAGINATION,
  SUPPORTED_EXPRESSIONS,
} from '../constants/expressions.js';
import { decodeCursor } from '../utils/cursor.js';
import { isValidTimeZone, TREND_UNITS } from '../utils/timeBuckets.js';

/** ISO-8601 timestamp with timezone (e.g. 2025-01-31T10:35:00.000Z) → Date. */
const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

const dateRangeFields = {
  from: isoDate.optional(),
  to: isoDate.optional(),
};

const isValidRange = (range: { from?: Date; to?: Date }) =>
  !range.from || !range.to || range.from <= range.to;
const RANGE_ERROR = { message: '`from` must be before `to`', path: ['from'] };

export const objectIdParamSchema = z.strictObject({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Must be a valid id'),
});

export const createExpressionSchema = z.strictObject({
  expression: z.enum(SUPPORTED_EXPRESSIONS),
  confidence: z.number().min(0).max(1),
  detectedAt: isoDate.refine((date) => date.getTime() <= Date.now() + MAX_CLOCK_SKEW_MS, {
    message: 'detectedAt cannot be in the future',
  }),
  durationMs: z.number().int().min(0).max(MAX_DETECTION_DURATION_MS).optional(),
  source: z.enum(DETECTION_SOURCES).optional(),
  // Note: no `userId` — ownership always comes from the authenticated session.
});

export const listExpressionsQuerySchema = z
  .strictObject({
    page: z.coerce.number().int().min(1).optional(),
    /**
     * Cursor mode: present (even empty = start from the newest) → the response has
     * `nextCursor` instead of page numbers. Opaque; pass back what the API returned.
     */
    cursor: z
      .string()
      .max(200)
      .optional()
      .transform((value, ctx) => {
        if (value === undefined || value === '') return value;
        const position = decodeCursor(value);
        if (!position) {
          ctx.addIssue({ code: 'custom', message: 'Invalid cursor' });
          return z.NEVER;
        }
        return position;
      }),
    limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
    expression: z.enum(SUPPORTED_EXPRESSIONS).optional(),
    ...dateRangeFields,
  })
  .refine(isValidRange, RANGE_ERROR)
  .refine((query) => query.page === undefined || query.cursor === undefined, {
    message: 'Use either page or cursor, not both',
    path: ['cursor'],
  });

export const statsQuerySchema = z.strictObject(dateRangeFields).refine(isValidRange, RANGE_ERROR);

export const trendsQuerySchema = z
  .strictObject({
    groupBy: z.enum(TREND_UNITS).default('day'),
    /** IANA zone (e.g. "Europe/London") so "a day" means the viewer's local day. */
    timezone: z.string().max(64).refine(isValidTimeZone, 'Unknown time zone').default('UTC'),
    ...dateRangeFields,
  })
  .refine(isValidRange, RANGE_ERROR);

export type CreateExpressionInput = z.output<typeof createExpressionSchema>;
export type ListExpressionsQuery = z.output<typeof listExpressionsQuerySchema>;
export type StatsQuery = z.output<typeof statsQuerySchema>;
export type TrendsQuery = z.output<typeof trendsQuerySchema>;
export type ObjectIdParams = z.output<typeof objectIdParamSchema>;
