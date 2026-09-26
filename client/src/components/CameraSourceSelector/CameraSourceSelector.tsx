import LaptopIcon from '@mui/icons-material/LaptopOutlined';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import { Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

/** Where frames come from. Future sources (IP camera, OBS…) would be added here. */
export type CameraSourceType = 'local' | 'phone';

interface CameraSourceSelectorProps {
  value: CameraSourceType;
  onChange: (value: CameraSourceType) => void;
  disabled?: boolean;
}

/**
 * "This device" (webcams, USB, virtual cameras via the device dropdown) or a
 * phone connected over WebRTC. The phone is not a `videoinput` device, so it
 * is chosen here rather than in the device list.
 */
export function CameraSourceSelector({ value, onChange, disabled }: CameraSourceSelectorProps) {
  return (
    <Stack spacing={1}>
      <Typography id="camera-source-label" variant="subtitle2" component="p">
        Camera source
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        color="primary"
        value={value}
        disabled={disabled}
        aria-labelledby="camera-source-label"
        onChange={(_event, next: CameraSourceType | null) => {
          if (next) onChange(next);
        }}
      >
        <ToggleButton value="local">
          <LaptopIcon fontSize="small" sx={{ mr: 1 }} aria-hidden />
          This device
        </ToggleButton>
        <ToggleButton value="phone">
          <PhoneIphoneIcon fontSize="small" sx={{ mr: 1 }} aria-hidden />
          Phone camera
        </ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  );
}
