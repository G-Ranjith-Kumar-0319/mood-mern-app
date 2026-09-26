import { MenuItem, TextField } from '@mui/material';
import type { CameraDevice } from '../../types/camera';

interface CameraSelectorProps {
  cameras: CameraDevice[];
  selectedCameraId: string | null;
  disabled: boolean;
  onSelect: (deviceId: string) => void;
}

/** Desktop camera picker (integrated, USB, virtual…). Phones get a "Switch camera" button instead. */
export function CameraSelector({
  cameras,
  selectedCameraId,
  disabled,
  onSelect,
}: CameraSelectorProps) {
  if (cameras.length === 0) return null;
  const value = cameras.some((camera) => camera.deviceId === selectedCameraId)
    ? (selectedCameraId ?? '')
    : '';

  return (
    <TextField
      select
      size="small"
      label="Camera source"
      value={value}
      disabled={disabled}
      onChange={(event) => onSelect(event.target.value)}
      sx={{ minWidth: 240, maxWidth: '100%' }}
    >
      {cameras.map((camera) => (
        <MenuItem key={camera.deviceId} value={camera.deviceId}>
          {camera.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
