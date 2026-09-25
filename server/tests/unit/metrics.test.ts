import { describe, expect, it } from 'vitest';
import { routeLabel } from '../../src/observability/metrics.js';

describe('routeLabel', () => {
  it.each([
    ['/api/v1/expressions/65f000000000000000000000', '/:id', '/api/v1/expressions/:id'],
    ['/api/v1/expressions?page=2', '/', '/api/v1/expressions'],
    ['/api/v1/expressions/stats?from=x', '/stats', '/api/v1/expressions/stats'],
    ['/api/v1/health/ready', '/ready', '/api/v1/health/ready'],
  ])('%s with pattern %s → %s', (originalUrl, path, expected) => {
    expect(routeLabel({ originalUrl, route: { path } })).toBe(expected);
  });

  it('labels unmatched requests without their (unbounded) URL', () => {
    expect(routeLabel({ originalUrl: '/random/123', route: undefined })).toBe('unmatched');
  });
});
