import { Paper, Stack, Typography } from '@mui/material';
import type { ExpressionStats } from '../../types/api';
import {
  formatConfidence,
  getExpressionEmoji,
  getExpressionLabel,
} from '../../utils/expressionDisplay';
import { formatDuration } from '../../utils/format';
import { summarize } from '../../utils/statsSummary';

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, flex: 1, minWidth: 140 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Paper>
  );
}

export function ExpressionSummary({ stats }: { stats: ExpressionStats }) {
  const figures = summarize(stats);
  const top = figures.topExpression;

  return (
    <Stack direction="row" useFlexGap spacing={2} sx={{ flexWrap: 'wrap' }}>
      <StatTile label="Detections" value={figures.total.toLocaleString()} />
      <StatTile
        label="Most frequent"
        value={top ? `${getExpressionEmoji(top)} ${getExpressionLabel(top)}` : '—'}
      />
      <StatTile
        label="Avg. confidence"
        value={
          figures.averageConfidence === null ? '—' : formatConfidence(figures.averageConfidence)
        }
      />
      <StatTile label="Time tracked" value={formatDuration(figures.totalDurationMs)} />
    </Stack>
  );
}
