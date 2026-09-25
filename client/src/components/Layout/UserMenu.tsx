import { Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router';
import { useCurrentUser, useLogout } from '../../hooks/useAuth';

export function UserMenu() {
  const { data: user, isPending } = useCurrentUser();
  const logout = useLogout();

  if (isPending) return null;

  if (!user) {
    return (
      <Button component={Link} to="/login" variant="outlined" size="small">
        Sign in
      </Button>
    );
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Button
        component={Link}
        to="/account"
        size="small"
        sx={{ maxWidth: 200, textTransform: 'none' }}
      >
        <Typography variant="body2" noWrap component="span">
          {user.displayName ?? user.email}
        </Typography>
      </Button>
      <Button size="small" onClick={() => logout.mutate()} loading={logout.isPending}>
        Sign out
      </Button>
    </Stack>
  );
}
