import { Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useState } from 'react';
import { ExpressionChart } from '../../components/Dashboard/ExpressionChart';
import { ExpressionSummary } from '../../components/Dashboard/ExpressionSummary';
import { TrendChart } from '../../components/Dashboard/TrendChart';
import { QueryState } from '../../components/History/QueryState';
import { useExpressionStats, useExpressionTrends } from '../../hooks/useExpressionHistory';
import type { TrendUnit } from '../../types/api';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type RangeKey = '24h' | '7d' | '30d' | 'all';

/** Each range picks a bucket size that yields a readable number of bars. */
const RANGES: Record<RangeKey, { label: string; ms: number | null; unit: TrendUnit }> = {
  '24h': { label: 'Last 24 hours', ms: DAY_MS, unit: 'hour' },
  '7d': { label: 'Last 7 days', ms: 7 * DAY_MS, unit: 'day' },
  '30d': { label: 'Last 30 days', ms: 30 * DAY_MS, unit: 'day' },
  all: { label: 'All time', ms: null, unit: 'month' },
};

/** The viewer's IANA zone, so "a day" on the chart is their local day. */
const VIEWER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === 'string' && value in RANGES;
}

/**
 * The `from` timestamp is computed once when the range is picked (not on every
 * render), otherwise the query key would change constantly and refetch forever.
 */
function rangeStart(key: RangeKey): string | undefined {
  const { ms } = RANGES[key];
  return ms === null ? undefined : new Date(Date.now() - ms).toISOString();
}

export function DashboardPage() {
  const [range, setRange] = useState<{ key: RangeKey; from?: string }>(() => ({
    key: '7d',
    from: rangeStart('7d'),
  }));
  const stats = useExpressionStats({ from: range.from });
  const rangeConfig = RANGES[range.key];
  const trends = useExpressionTrends({
    groupBy: rangeConfig.unit,
    timezone: VIEWER_TIME_ZONE,
    from: range.from,
  });

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Typography variant="h4" component="h1">
          Expression statistics
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={range.key}
          aria-label="Time range"
          onChange={(_event, value: unknown) => {
            if (isRangeKey(value)) setRange({ key: value, from: rangeStart(value) });
          }}
        >
          {Object.entries(RANGES).map(([key, { label }]) => (
            <ToggleButton key={key} value={key} aria-label={label}>
              {key === 'all' ? 'All' : key}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      <QueryState
        isPending={stats.isPending}
        error={stats.error}
        isEmpty={stats.data?.total === 0}
        emptyMessage={`No detections in this period (${rangeConfig.label.toLowerCase()}).`}
        onRetry={() => void stats.refetch()}
      >
        {stats.data && (
          <Stack spacing={3}>
            <ExpressionSummary stats={stats.data} />
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" component="h2">
                Detections by expression
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {rangeConfig.label} · count and share of saved detections
              </Typography>
              <ExpressionChart items={stats.data.byExpression} />
            </Paper>
            <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography variant="h6" component="h2">
                Detections over time
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {rangeConfig.label} · per {rangeConfig.unit} · {VIEWER_TIME_ZONE}
              </Typography>
              {trends.data ? (
                <TrendChart trends={trends.data} />
              ) : (
                <Typography color={trends.error ? 'error' : 'text.secondary'}>
                  {trends.error ? 'Could not load the trend.' : 'Loading…'}
                </Typography>
              )}
            </Paper>
          </Stack>
        )}
      </QueryState>
    </Stack>
  );
}
