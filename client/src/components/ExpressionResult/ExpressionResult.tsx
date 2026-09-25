import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import type { DetectorViewState } from '../../utils/detectorViewState';
import { getExpressionEmoji, getExpressionLabel } from '../../utils/expressionDisplay';
import { ConfidenceIndicator } from '../ConfidenceIndicator/ConfidenceIndicator';

interface ExpressionResultProps {
  state: DetectorViewState;
}

interface Presentation {
  emoji: string | null;
  title: string;
  hint: string;
  busy?: boolean;
  dimmed?: boolean;
}

function present(state: DetectorViewState): Presentation {
  switch (state.kind) {
    case 'idle':
      return { emoji: '📷', title: 'Camera is off', hint: 'Start the camera to begin.' };
    case 'requesting-camera':
      return {
        emoji: null,
        title: 'Waiting for camera permission…',
        hint: 'Allow camera access in the browser prompt.',
        busy: true,
      };
    case 'loading-model':
      return {
        emoji: null,
        title: 'Loading AI model…',
        hint: 'This only happens once per visit.',
        busy: true,
      };
    case 'detecting':
      return { emoji: null, title: 'Detecting face…', hint: 'Look at the camera.', busy: true };
    case 'no-face':
      return {
        emoji: '🙈',
        title: 'No face detected',
        hint: 'Face the camera in good lighting.',
      };
    case 'low-confidence':
      return {
        emoji: getExpressionEmoji(state.expression.expression),
        title: `${getExpressionLabel(state.expression.expression)} (uncertain)`,
        hint: 'Low confidence. Try better lighting or face the camera directly.',
        dimmed: true,
      };
    case 'detected':
      return {
        emoji: getExpressionEmoji(state.expression.expression),
        title: getExpressionLabel(state.expression.expression),
        hint: 'Detected expression',
      };
    case 'camera-error':
    case 'model-error':
    case 'inference-error':
      return { emoji: '⚠️', title: 'Detection unavailable', hint: state.error.message };
  }
}

/** The big emoji + label panel. Text always accompanies the emoji so meaning never relies on it. */
export function ExpressionResult({ state }: ExpressionResultProps) {
  const { emoji, title, hint, busy, dimmed } = present(state);
  const expression =
    state.kind === 'detected' || state.kind === 'low-confidence' ? state.expression : null;

  return (
    <Stack spacing={2} sx={{ alignItems: 'center', textAlign: 'center', width: '100%' }}>
      <Box
        sx={{ height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        aria-hidden
      >
        {busy ? (
          <CircularProgress />
        ) : (
          <Typography sx={{ fontSize: 80, lineHeight: 1, opacity: dimmed ? 0.5 : 1 }}>
            {emoji}
          </Typography>
        )}
      </Box>

      {/* Only the label is a live region: confidence changes ~10×/s and would flood screen readers. */}
      <Box aria-live="polite" aria-atomic>
        <Typography variant="overline" color="text.secondary" component="p">
          {hint}
        </Typography>
        <Typography variant="h4" component="p" data-testid="expression-title">
          {title}
        </Typography>
      </Box>

      {expression && <ConfidenceIndicator confidence={expression.confidence} />}
    </Stack>
  );
}
