import { Alert } from '@mui/material';

export const DISCLAIMER =
  'This application estimates visible facial expressions using an AI model. It does not determine or diagnose a person’s actual emotional or mental state.';

/** Product disclaimer + privacy summary shown on the home page. */
export function PrivacyNotice() {
  return (
    // A static notice, not an urgent message: role="note" avoids screen readers announcing it as an alert.
    <Alert severity="info" variant="outlined" role="note">
      {DISCLAIMER} Video is analysed on your device and is never uploaded or stored. Only the
      detected expression label, confidence and time are saved when you choose to save them.
    </Alert>
  );
}
