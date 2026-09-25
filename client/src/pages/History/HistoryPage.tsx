import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { ErrorState } from '../../components/ErrorState/ErrorState';
import { HistoryTable } from '../../components/History/HistoryTable';
import { QueryState } from '../../components/History/QueryState';
import { SUPPORTED_EXPRESSIONS, type Expression } from '../../constants/expressions';
import { useDeleteDetection, useExpressionFeed } from '../../hooks/useExpressionHistory';
import { getErrorMessage } from '../../services/apiClient';
import { getExpressionLabel, isSupportedExpression } from '../../utils/expressionDisplay';

const PAGE_SIZE = 20;
const ALL = 'all';

/**
 * Newest-first history with "Load more". Uses cursor pagination, so loading
 * page 50 is as fast as page 1 (no skipping, no counting).
 */
export function HistoryPage() {
  const [expression, setExpression] = useState<Expression | undefined>(undefined);
  const feed = useExpressionFeed({ limit: PAGE_SIZE, expression });
  const deletion = useDeleteDetection();
  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Stack spacing={3}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Typography variant="h4" component="h1">
          Detection history
        </Typography>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel id="expression-filter-label">Expression</InputLabel>
          <Select
            labelId="expression-filter-label"
            label="Expression"
            value={expression ?? ALL}
            onChange={(event) => {
              const value = event.target.value;
              setExpression(isSupportedExpression(value) ? value : undefined);
            }}
          >
            <MenuItem value={ALL}>All expressions</MenuItem>
            {SUPPORTED_EXPRESSIONS.map((value) => (
              <MenuItem key={value} value={value}>
                {getExpressionLabel(value)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {deletion.error && (
        <ErrorState title="Delete failed" message={getErrorMessage(deletion.error)} />
      )}

      <Paper variant="outlined">
        <QueryState
          isPending={feed.isPending}
          error={feed.error}
          isEmpty={items.length === 0}
          emptyMessage="No detections saved yet. Turn on auto-save on the Detect page."
          onRetry={() => void feed.refetch()}
        >
          <HistoryTable
            items={items}
            onDelete={(id) => deletion.mutate(id)}
            deletingId={deletion.isPending ? deletion.variables : null}
          />
          <Box
            sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}
          >
            <Typography variant="body2" color="text.secondary" role="status">
              Showing {items.length} detection{items.length === 1 ? '' : 's'}
              {feed.hasNextPage ? '' : ' (all)'}
            </Typography>
            {feed.hasNextPage && (
              <Button
                variant="outlined"
                onClick={() => void feed.fetchNextPage()}
                loading={feed.isFetchingNextPage}
              >
                Load more
              </Button>
            )}
          </Box>
          {feed.isFetchNextPageError && (
            <Box sx={{ px: 2, pb: 2 }}>
              <ErrorState title="Could not load more" message={getErrorMessage(feed.error)} />
            </Box>
          )}
        </QueryState>
      </Paper>
    </Stack>
  );
}
