import CameraswitchIcon from '@mui/icons-material/Cameraswitch';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { Button, Stack, Typography } from '@mui/material';
import type { CameraFacingMode, CameraStatus } from '../../types/camera';

const CAMERA_STATUS_LABEL: Record<CameraStatus, string> = {
  idle: 'Off',
  'requesting-permission': 'Requesting permission',
  active: 'On',
  switching: 'Switching camera',
  error: 'Error',
};

const FACING_LABEL: Record<CameraFacingMode, string | null> = {
  user: 'front camera',
  environment: 'rear camera',
  unknown: null,
};

interface CameraControlsProps {
  status: CameraStatus;
  facingMode: CameraFacingMode;
  canSwitchCamera: boolean;
  onStart: () => void;
  onStop: () => void;
  onSwitch: () => void;
}

export function CameraControls({
  status,
  facingMode,
  canSwitchCamera,
  onStart,
  onStop,
  onSwitch,
}: CameraControlsProps) {
  const isBusy = status === 'requesting-permission' || status === 'switching';
  const isOn = status === 'active' || isBusy;
  const facingLabel = status === 'active' ? FACING_LABEL[facingMode] : null;

  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      spacing={{ xs: 1.5, sm: 2 }}
      sx={{ alignItems: { xs: 'stretch', sm: 'center' }, flexWrap: 'wrap' }}
    >
      {canSwitchCamera && (
        <Button
          variant="outlined"
          startIcon={<CameraswitchIcon />}
          onClick={onSwitch}
          disabled={status !== 'active'}
        >
          Switch camera
        </Button>
      )}
      <Button variant="contained" startIcon={<PlayArrowIcon />} onClick={onStart} disabled={isOn}>
        Start camera
      </Button>
      <Button variant="outlined" startIcon={<StopIcon />} onClick={onStop} disabled={!isOn}>
        Stop camera
      </Button>
      <Typography variant="body2" color="text.secondary" role="status">
        Camera status: <strong>{CAMERA_STATUS_LABEL[status]}</strong>
        {facingLabel && ` (${facingLabel})`}
      </Typography>
    </Stack>
  );
}
