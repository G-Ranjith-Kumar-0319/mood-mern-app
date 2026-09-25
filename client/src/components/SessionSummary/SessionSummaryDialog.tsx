import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import { getExpressionEmoji, getExpressionLabel } from '../../utils/expressionDisplay';
import { formatDuration } from '../../utils/format';
import type { SessionSummary } from '../../utils/sessionRecorder';

interface SessionSummaryDialogProps {
  summary: SessionSummary | null;
  onClose: () => void;
}

/** Shown when the camera stops: how long each expression was visible in this session. */
export function SessionSummaryDialog({ summary, onClose }: SessionSummaryDialogProps) {
  return (
    <Dialog open={summary !== null} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Session summary</DialogTitle>
      {summary && (
        <DialogContent>
          <Stack spacing={2}>
            <Typography color="text.secondary">
              Camera on for <strong>{formatDuration(summary.durationMs)}</strong>
              {summary.durationMs > 0 &&
                ` · a confident expression was visible ${Math.round(
                  (summary.detectedMs / summary.durationMs) * 100,
                )}% of the time`}
              .
            </Typography>

            {summary.dominant ? (
              <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                <Typography sx={{ fontSize: 40, lineHeight: 1 }} aria-hidden>
                  {getExpressionEmoji(summary.dominant)}
                </Typography>
                <Box>
                  <Typography variant="overline" color="text.secondary" component="p">
                    Most visible expression
                  </Typography>
                  <Typography variant="h6" component="p">
                    {getExpressionLabel(summary.dominant)}
                  </Typography>
                </Box>
              </Stack>
            ) : (
              <Typography>No confident expression was detected in this session.</Typography>
            )}

            <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', p: 0, m: 0 }}>
              {summary.byExpression.map((item) => (
                <Box component="li" key={item.expression}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
                    <Typography variant="body2">
                      <span aria-hidden>{getExpressionEmoji(item.expression)} </span>
                      {getExpressionLabel(item.expression)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {formatDuration(item.ms)} · {Math.round(item.share * 100)}%
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={item.share * 100}
                    aria-label={`${getExpressionLabel(item.expression)} share`}
                    sx={{ height: 6, borderRadius: 3, mt: 0.5 }}
                  />
                </Box>
              ))}
            </Stack>

            <Typography variant="caption" color="text.secondary">
              Estimated from visible facial expressions only. This summary stays on your device and
              is not saved.
            </Typography>
          </Stack>
        </DialogContent>
      )}
      <DialogActions>
        <Button onClick={onClose} autoFocus>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
