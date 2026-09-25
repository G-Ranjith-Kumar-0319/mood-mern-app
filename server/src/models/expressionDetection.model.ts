import { model, Schema, type InferSchemaType, type Types } from 'mongoose';
import {
  DETECTION_SOURCES,
  MAX_DETECTION_DURATION_MS,
  SUPPORTED_EXPRESSIONS,
} from '../constants/expressions.js';

/**
 * One *meaningful* detection event (a stable expression segment or a manual
 * save) — never every frame, and never any image data.
 */
const expressionDetectionSchema = new Schema(
  {
    /** null = saved anonymously (auth is optional). Always taken from the session, never the body. */
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    expression: { type: String, enum: SUPPORTED_EXPRESSIONS, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    detectedAt: { type: Date, required: true },
    durationMs: { type: Number, min: 0, max: MAX_DETECTION_DURATION_MS, default: null },
    source: { type: String, enum: DETECTION_SOURCES, default: 'camera', required: true },
    /** When MongoDB's TTL monitor deletes this document (null = never). See data retention. */
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

/**
 * Supports every query the API makes (see docs/database.md):
 * - history:  { userId } sorted by detectedAt desc (+ optional date range)
 * - stats:    $match { userId, detectedAt range } → $group by expression
 * The owner filter is an equality on the prefix and the date is a range/sort
 * on the suffix — the classic "equality, sort, range" ordering. `_id` is the
 * tie-breaker of the history sort and of cursor pagination, so including it lets
 * MongoDB return documents in index order with no in-memory SORT stage.
 */
expressionDetectionSchema.index({ userId: 1, detectedAt: -1, _id: -1 });

/**
 * TTL index: MongoDB's background monitor (runs about once a minute) deletes documents
 * whose `expiresAt` has passed. Documents with `expiresAt: null` are never expired.
 */
expressionDetectionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type ExpressionDetection = InferSchemaType<typeof expressionDetectionSchema> & {
  _id: Types.ObjectId;
};

export const ExpressionDetectionModel = model('ExpressionDetection', expressionDetectionSchema);
