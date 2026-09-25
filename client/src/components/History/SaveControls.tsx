import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { Alert, Button, FormControlLabel, Stack, Switch, Typography } from '@mui/material';
import { PERSISTENCE_CONFIG } from '../../constants/persistence';
import { getErrorMessage } from '../../services/apiClient';
import { formatDuration } from '../../utils/format';

interface SaveControlsProps {
  autoSave: boolean;
  onAutoSaveChange: (enabled: boolean) => void;
  /** Disabled when there is no confident expression to save. */
  canSaveNow: boolean;
  onSaveNow: () => void;
  isSaving: boolean;
  savedCount: number;
  error: unknown;
  isSignedIn: boolean;
}

/** Explicit user control over what gets persisted (nothing is saved by default). */
export function SaveControls({
  autoSave,
  onAutoSaveChange,
  canSaveNow,
  onSaveNow,
  isSaving,
  savedCount,
  error,
  isSignedIn,
}: SaveControlsProps) {
  return (
    <Stack spacing={1} sx={{ width: '100%' }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControlLabel
          control={
            <Switch
              checked={autoSave}
              onChange={(event) => onAutoSaveChange(event.target.checked)}
            />
          }
          label="Auto-save"
        />
        <Button
          variant="outlined"
          size="small"
          startIcon={<SaveOutlinedIcon />}
          onClick={onSaveNow}
          disabled={!canSaveNow || isSaving}
        >
          Save now
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Auto-save stores an expression after it has been stable for{' '}
        {formatDuration(PERSISTENCE_CONFIG.minSegmentMs)} (only the label, confidence and time).
        {savedCount > 0 && ` Saved this session: ${savedCount}.`}
        {!isSignedIn && ' You are not signed in, so saves go to the shared anonymous history.'}
      </Typography>
      {Boolean(error) && (
        <Alert severity="warning" role="alert">
          Could not save: {getErrorMessage(error)}
        </Alert>
      )}
    </Stack>
  );
}
