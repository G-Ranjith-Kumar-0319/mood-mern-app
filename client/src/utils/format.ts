const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/** 4200 → "4s", 95_000 → "1m 35s", null → "—". */
export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || durationMs < 0) return '—';
  const totalSeconds = Math.round(durationMs / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

/** Locale-aware date + time, e.g. "Jan 31, 10:35 AM". */
export function formatDateTime(iso: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}
