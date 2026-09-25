import {
  Box,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import type { ExpressionStatItem } from '../../types/api';
import {
  formatConfidence,
  getExpressionEmoji,
  getExpressionLabel,
} from '../../utils/expressionDisplay';
import { formatDuration } from '../../utils/format';

interface ExpressionChartProps {
  items: ExpressionStatItem[];
}

const BAR_HEIGHT = 12;

function tooltipText(item: ExpressionStatItem): string {
  return [
    `${getExpressionLabel(item.expression)}: ${item.count} (${item.percentage}%)`,
    `Avg. confidence ${formatConfidence(item.averageConfidence)}`,
    `Time ${formatDuration(item.totalDurationMs)}`,
  ].join(' · ');
}

/**
 * One measure (count) across categories → horizontal bars in a single hue.
 * The expression name is the label, so colour never carries identity; each
 * bar is direct-labelled and has a hover/focus tooltip. A table view is one
 * switch away for screen-reader and exact-value use.
 */
export function ExpressionChart({ items }: ExpressionChartProps) {
  const [showTable, setShowTable] = useState(false);
  const maxCount = Math.max(1, ...items.map((item) => item.count));

  return (
    <Stack spacing={2}>
      <FormControlLabel
        control={<Switch checked={showTable} onChange={(e) => setShowTable(e.target.checked)} />}
        label="Show as table"
        sx={{ alignSelf: 'flex-end' }}
      />

      {showTable ? (
        <Table size="small" aria-label="Detections by expression">
          <TableHead>
            <TableRow>
              <TableCell>Expression</TableCell>
              <TableCell align="right">Count</TableCell>
              <TableCell align="right">Share</TableCell>
              <TableCell align="right">Avg. confidence</TableCell>
              <TableCell align="right">Time</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.expression}>
                <TableCell>{getExpressionLabel(item.expression)}</TableCell>
                <TableCell align="right">{item.count}</TableCell>
                <TableCell align="right">{item.percentage}%</TableCell>
                <TableCell align="right">
                  {item.count > 0 ? formatConfidence(item.averageConfidence) : '—'}
                </TableCell>
                <TableCell align="right">{formatDuration(item.totalDurationMs)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Stack
          component="ul"
          spacing={1.5}
          sx={{ listStyle: 'none', m: 0, p: 0 }}
          aria-label="Detections by expression"
        >
          {items.map((item) => (
            <Tooltip key={item.expression} title={tooltipText(item)} placement="top" followCursor>
              <Box
                component="li"
                tabIndex={0}
                aria-label={tooltipText(item)}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '104px 1fr 72px', sm: '128px 1fr 88px' },
                  alignItems: 'center',
                  gap: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  '&:hover, &:focus-visible': { bgcolor: 'action.hover', outline: 'none' },
                }}
              >
                <Typography variant="body2" noWrap>
                  <span aria-hidden>{getExpressionEmoji(item.expression)} </span>
                  {getExpressionLabel(item.expression)}
                </Typography>
                <Box sx={{ height: BAR_HEIGHT, position: 'relative' }}>
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      // Rounded data-end only; the bar stays anchored flat to the baseline.
                      borderRadius: '0 4px 4px 0',
                      bgcolor: 'primary.main',
                      width: `${(item.count / maxCount) * 100}%`,
                      minWidth: item.count > 0 ? 2 : 0,
                    }}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right' }}>
                  {item.count} · {item.percentage}%
                </Typography>
              </Box>
            </Tooltip>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
