import { Box, LinearProgress, Typography } from '@mui/material';
import { formatConfidence, isConfident } from '../../utils/expressionDisplay';

interface ConfidenceIndicatorProps {
  confidence: number;
}

/** Numeric + bar display of model confidence. The text carries the meaning; colour is secondary. */
export function ConfidenceIndicator({ confidence }: ConfidenceIndicatorProps) {
  const percent = Math.round(Math.min(1, Math.max(0, confidence)) * 100);
  const confident = isConfident(confidence);

  return (
    <Box sx={{ width: '100%' }}>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Confidence: <strong>{formatConfidence(confidence)}</strong>
        {!confident && ' (low)'}
      </Typography>
      <LinearProgress
        variant="determinate"
        value={percent}
        color={confident ? 'success' : 'warning'}
        aria-label="Model confidence"
        sx={{ height: 8, borderRadius: 4 }}
      />
    </Box>
  );
}
