import { Alert } from '@mui/material';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

/** Explains what still works offline (detection) and what does not (saving, history). */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <Alert severity="warning" square role="status">
      You are offline. Expression detection still works on this device; saving, history and
      statistics need a connection.
    </Alert>
  );
}
