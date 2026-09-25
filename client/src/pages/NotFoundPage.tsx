import { Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <Stack spacing={2} sx={{ alignItems: 'center', py: 8, textAlign: 'center' }}>
      <Typography variant="h4" component="h1">
        Page not found
      </Typography>
      <Button component={Link} to="/" variant="contained">
        Back to the detector
      </Button>
    </Stack>
  );
}
