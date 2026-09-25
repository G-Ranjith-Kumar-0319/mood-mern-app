/**
 * Calendar maths for time-series buckets in an IANA time zone, without a date
 * library. MongoDB's `$dateTrunc` produces the bucket starts; these helpers
 * generate the *missing* buckets so charts show empty periods as zero instead
 * of silently skipping them.
 */

export const TREND_UNITS = ['hour', 'day', 'week', 'month'] as const;
export type TrendUnit = (typeof TREND_UNITS)[number];

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

interface LocalParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** Offset (ms) of `timeZone` from UTC at the given instant, e.g. +3_600_000 for UTC+1. */
function zoneOffset(date: Date, timeZone: string): number {
  const p = localParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(date.getTime() / MS_PER_MINUTE) * MS_PER_MINUTE;
}

/** The UTC instant at which the local wall-clock time occurs in `timeZone`. */
function fromLocal(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour);
  // Two passes settle the offset correctly across DST transitions.
  const first = guess - zoneOffset(new Date(guess), timeZone);
  return new Date(guess - zoneOffset(new Date(first), timeZone));
}

/** The start of the bucket after `start` (which must itself be a bucket start). */
export function nextBucketStart(start: Date, unit: TrendUnit, timeZone: string): Date {
  if (unit === 'hour') return new Date(start.getTime() + MS_PER_HOUR);
  const { year, month, day } = localParts(start, timeZone);
  if (unit === 'day') return fromLocal(year, month, day + 1, 0, timeZone);
  if (unit === 'week') return fromLocal(year, month, day + 7, 0, timeZone);
  return fromLocal(year, month + 1, 1, 0, timeZone);
}

/**
 * Every bucket start from `first` to `last` inclusive. Returns null when that
 * would exceed `maxBuckets` (the caller should ask for a coarser unit).
 */
export function bucketRange(
  first: Date,
  last: Date,
  unit: TrendUnit,
  timeZone: string,
  maxBuckets: number,
): Date[] | null {
  const buckets: Date[] = [];
  for (let current = first; current <= last; current = nextBucketStart(current, unit, timeZone)) {
    if (buckets.length === maxBuckets) return null;
    buckets.push(current);
  }
  return buckets;
}

const DAYS_PER_WEEK = 7;
/** Weeks start on Monday (matches `$dateTrunc` with `startOfWeek: 'monday'`). */
const MONDAY = 1;

/** The start of the bucket containing `date` — mirrors MongoDB's `$dateTrunc`. */
export function truncateToBucket(date: Date, unit: TrendUnit, timeZone: string): Date {
  const { year, month, day, hour } = localParts(date, timeZone);
  switch (unit) {
    case 'hour':
      return fromLocal(year, month, day, hour, timeZone);
    case 'day':
      return fromLocal(year, month, day, 0, timeZone);
    case 'week': {
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const daysSinceMonday = (weekday - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;
      return fromLocal(year, month, day - daysSinceMonday, 0, timeZone);
    }
    case 'month':
      return fromLocal(year, month, 1, 0, timeZone);
  }
}
