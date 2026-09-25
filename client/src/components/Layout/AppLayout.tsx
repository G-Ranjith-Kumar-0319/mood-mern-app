import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';
import { NavLink, Outlet } from 'react-router';
import { LiveIndicator } from './LiveIndicator';
import { OfflineBanner } from './OfflineBanner';
import { UserMenu } from './UserMenu';

const NAV_ITEMS = [
  { to: '/', label: 'Detect' },
  { to: '/history', label: 'History' },
  { to: '/dashboard', label: 'Dashboard' },
] as const;

export function AppLayout() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar
        position="static"
        color="default"
        elevation={0}
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" component="span" sx={{ flexGrow: 1 }}>
            <span aria-hidden>😊 </span>Expression Detector
          </Typography>
          <Stack component="nav" aria-label="Main" direction="row" spacing={1}>
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                end
                sx={{ '&.active': { fontWeight: 700, textDecoration: 'underline' } }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>
          <LiveIndicator />
          <UserMenu />
        </Toolbar>
      </AppBar>
      <OfflineBanner />

      <Container component="main" maxWidth="lg" sx={{ py: { xs: 2, md: 4 }, flexGrow: 1 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
