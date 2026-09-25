import DeleteIcon from '@mui/icons-material/Delete';
import {
  Box,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from '@mui/material';
import type { ExpressionDetectionRecord } from '../../types/api';
import {
  formatConfidence,
  getExpressionEmoji,
  getExpressionLabel,
} from '../../utils/expressionDisplay';
import { visuallyHiddenSx } from '../../utils/a11y';
import { formatDateTime, formatDuration } from '../../utils/format';

interface HistoryTableProps {
  items: ExpressionDetectionRecord[];
  onDelete?: (id: string) => void;
  deletingId?: string | null;
  /** Compact mode hides secondary columns (used on the home page). */
  compact?: boolean;
}

export function HistoryTable({ items, onDelete, deletingId, compact = false }: HistoryTableProps) {
  return (
    <TableContainer>
      <Table size={compact ? 'small' : 'medium'} aria-label="Detection history">
        <TableHead>
          <TableRow>
            <TableCell>Expression</TableCell>
            <TableCell align="right">Confidence</TableCell>
            {!compact && <TableCell align="right">Duration</TableCell>}
            <TableCell align="right">Detected at</TableCell>
            {onDelete && (
              <TableCell align="right">
                <Box component="span" sx={visuallyHiddenSx}>
                  Actions
                </Box>
              </TableCell>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((item) => {
            const label = getExpressionLabel(item.expression);
            return (
              <TableRow key={item.id} hover>
                <TableCell>
                  <span aria-hidden>{getExpressionEmoji(item.expression)} </span>
                  {label}
                </TableCell>
                <TableCell align="right">{formatConfidence(item.confidence)}</TableCell>
                {!compact && <TableCell align="right">{formatDuration(item.durationMs)}</TableCell>}
                <TableCell align="right">
                  <time dateTime={item.detectedAt}>{formatDateTime(item.detectedAt)}</time>
                </TableCell>
                {onDelete && (
                  <TableCell align="right" padding="checkbox">
                    <Tooltip title="Delete">
                      <span>
                        <IconButton
                          aria-label={`Delete ${label} detection from ${formatDateTime(item.detectedAt)}`}
                          onClick={() => onDelete(item.id)}
                          disabled={deletingId === item.id}
                          size="small"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
