const DEFAULT_MIN_SEGMENT_MS = 2000;
const DEFAULT_MAX_SEGMENT_MS = 60_000;

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * When auto-save is on, an expression is saved as one "segment" event:
 * - segments shorter than `minSegmentMs` are ignored (fleeting expressions);
 * - a segment longer than `maxSegmentMs` is saved and a new one started,
 *   so a long session still produces periodic history entries.
 * Result: at most ~1 write per `minSegmentMs`, instead of ~10 predictions/sec.
 */
export const PERSISTENCE_CONFIG = {
  minSegmentMs: readPositiveInt(
    import.meta.env.VITE_PERSIST_MIN_SEGMENT_MS,
    DEFAULT_MIN_SEGMENT_MS,
  ),
  maxSegmentMs: readPositiveInt(
    import.meta.env.VITE_PERSIST_MAX_SEGMENT_MS,
    DEFAULT_MAX_SEGMENT_MS,
  ),
} as const;
