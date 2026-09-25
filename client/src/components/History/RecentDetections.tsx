import { Button, Paper, Stack, Typography } from '@mui/material';
import { Link } from 'react-router';
import { useExpressionHistory } from '../../hooks/useExpressionHistory';
import { HistoryTable } from './HistoryTable';
import { QueryState } from './QueryState';

const RECENT_LIMIT = 5;

/** The latest few saved detections, shown under the camera on the home page. */
export function RecentDetections() {
  const history = useExpressionHistory({ page: 1, limit: RECENT_LIMIT });
  const items = history.data?.items ?? [];

  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" component="h2">
          Recent history
        </Typography>
        <Button component={Link} to="/history" size="small">
          View all
        </Button>
      </Stack>
      <QueryState
        isPending={history.isPending}
        error={history.error}
        isEmpty={items.length === 0}
        emptyMessage="Nothing saved yet."
        onRetry={() => void history.refetch()}
      >
        <HistoryTable items={items} compact />
      </QueryState>
    </Paper>
  );
}
