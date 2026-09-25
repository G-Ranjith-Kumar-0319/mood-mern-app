import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDuration } from './format';

describe('formatDuration', () => {
  it.each([
    [null, '—'],
    [0, '0s'],
    [4200, '4s'],
    [60_000, '1m'],
    [95_000, '1m 35s'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatDuration(value)).toBe(expected);
  });
});

describe('formatDateTime', () => {
  it('formats an ISO timestamp for display', () => {
    const formatted = formatDateTime('2025-01-31T10:35:00.000Z', 'en-US');
    expect(formatted).toMatch(/Jan 31/);
  });
});
