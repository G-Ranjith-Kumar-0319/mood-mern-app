import { Box, Tooltip, Typography } from '@mui/material';
import { useCurrentUser } from '../../hooks/useAuth';
import { useLiveUpdates, type LiveStatus } from '../../hooks/useLiveUpdates';

const LABEL: Record<LiveStatus, string> = {
  live: 'Live',
  connecting: 'Reconnecting…',
  unsupported: 'Live updates unavailable',
};

const DESCRIPTION: Record<LiveStatus, string> = {
  live: 'History and statistics update automatically when a detection is saved anywhere.',
  connecting: 'Trying to reconnect to live updates.',
  unsupported: 'This browser does not support live updates; refresh to see new data.',
};

/** Keeps the live-update stream open app-wide and shows its state (text + dot, not colour alone). */
export function LiveIndicator() {
  const { data: user, isPending } = useCurrentUser();
  // Wait for the auth check so the stream opens once, with the right identity.
  const identity = isPending ? null : (user?.id ?? 'anonymous');
  return identity ? <LiveBadge identity={identity} /> : null;
}

function LiveBadge({ identity }: { identity: string }) {
  const status = useLiveUpdates(identity);
  return (
    <Tooltip title={DESCRIPTION[status]}>
      <Box
        role="status"
        aria-label={`${LABEL[status]}. ${DESCRIPTION[status]}`}
        sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
      >
        <Box
          aria-hidden
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: status === 'live' ? 'success.main' : 'text.disabled',
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {LABEL[status]}
        </Typography>
      </Box>
    </Tooltip>
  );
}
