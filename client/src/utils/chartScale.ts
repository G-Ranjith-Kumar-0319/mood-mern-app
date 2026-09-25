import type { TrendUnit } from '../types/api';

export interface AxisScale {
  max: number;
  ticks: number[];
}

/** Smallest 1, 2 or 5 × 10ⁿ that is ≥ value. */
function niceStep(value: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  return ([1, 2, 5, 10].find((step) => normalized <= step) ?? 10) * magnitude;
}

/**
 * Integer count axis: picks a round tick step first (1/2/5 × 10ⁿ), then extends
 * the top to the next multiple, so the highest tick is always the axis end
 * (e.g. max 21 → ticks 0, 10, 20, 30).
 */
export function countScale(dataMax: number, targetTicks = 4): AxisScale {
  const step = Math.max(1, niceStep(Math.max(1, dataMax) / targetTicks));
  const max = Math.max(step, Math.ceil(dataMax / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= max; value += step) ticks.push(value);
  return { max, ticks };
}

/** Show every n-th x label so labels never overlap (min spacing in px). */
export function labelStride(barCount: number, plotWidth: number, minSpacing = 64): number {
  if (barCount === 0) return 1;
  const fits = Math.max(1, Math.floor(plotWidth / minSpacing));
  return Math.max(1, Math.ceil(barCount / fits));
}

const FORMATS: Record<TrendUnit, Intl.DateTimeFormatOptions> = {
  hour: { hour: 'numeric' },
  day: { month: 'short', day: 'numeric' },
  week: { month: 'short', day: 'numeric' },
  month: { month: 'short', year: 'numeric' },
};

const LONG_FORMATS: Record<TrendUnit, Intl.DateTimeFormatOptions> = {
  hour: { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  day: { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' },
  week: { month: 'short', day: 'numeric', year: 'numeric' },
  month: { month: 'long', year: 'numeric' },
};

/** Axis label for a bucket start, in the same time zone the server bucketed in. */
export function formatPeriod(
  period: string,
  unit: TrendUnit,
  timeZone: string,
  { long = false, locale }: { long?: boolean; locale?: string } = {},
): string {
  const options = { ...(long ? LONG_FORMATS : FORMATS)[unit], timeZone };
  const text = new Intl.DateTimeFormat(locale, options).format(new Date(period));
  return unit === 'week' ? `Week of ${text}` : text;
}
