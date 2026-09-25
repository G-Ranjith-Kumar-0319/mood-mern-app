import { Alert, Button, Link as MuiLink, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useRequestPasswordReset, useResetPassword, useVerifyEmail } from '../../hooks/useAccount';
import { getErrorMessage } from '../../services/apiClient';

const MIN_PASSWORD_LENGTH = 8;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ maxWidth: 440, mx: 'auto', p: { xs: 3, sm: 4 } }}>
      <Stack spacing={2.5}>
        <Typography variant="h5" component="h1">
          {title}
        </Typography>
        {children}
      </Stack>
    </Paper>
  );
}

function MissingToken() {
  return (
    <Alert severity="error">
      This link is incomplete. Open the link from your email again, or request a new one.
    </Alert>
  );
}

/**
 * The user confirms with a click instead of verifying on page load: email security
 * scanners pre-fetch links, and an automatic request would silently use up the
 * single-use token.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const verify = useVerifyEmail();

  return (
    <Card title="Verify your email">
      {!token ? (
        <MissingToken />
      ) : verify.isSuccess ? (
        <>
          <Alert severity="success">Thanks, your email address is verified.</Alert>
          <Button component={Link} to="/" variant="contained">
            Go to the detector
          </Button>
        </>
      ) : (
        <>
          <Typography color="text.secondary">Confirm that this is your email address.</Typography>
          {verify.error && <Alert severity="error">{getErrorMessage(verify.error)}</Alert>}
          <Button
            variant="contained"
            loading={verify.isPending}
            onClick={() => verify.mutate(token)}
          >
            Verify my email
          </Button>
        </>
      )}
    </Card>
  );
}

export function ForgotPasswordPage() {
  const request = useRequestPasswordReset();
  const [email, setEmail] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    request.mutate(email);
  };

  return (
    <Card title="Forgot your password?">
      {request.isSuccess ? (
        // Deliberately identical for unknown addresses (no account enumeration).
        <Alert severity="success">
          If an account exists for {email}, we sent a link to reset the password. It expires in 1
          hour.
        </Alert>
      ) : (
        <Stack component="form" spacing={2} onSubmit={handleSubmit}>
          <Typography color="text.secondary">
            Enter your email and we will send you a link to choose a new password.
          </Typography>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {request.error && <Alert severity="error">{getErrorMessage(request.error)}</Alert>}
          <Button type="submit" variant="contained" loading={request.isPending}>
            Send reset link
          </Button>
        </Stack>
      )}
      <MuiLink component={Link} to="/login" sx={{ textAlign: 'center' }}>
        Back to sign in
      </MuiLink>
    </Card>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const reset = useResetPassword();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    reset.mutate({ token, password }, { onSuccess: () => void navigate('/account') });
  };

  return (
    <Card title="Choose a new password">
      {!token ? (
        <MissingToken />
      ) : (
        <Stack component="form" spacing={2} onSubmit={handleSubmit}>
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            helperText={`At least ${MIN_PASSWORD_LENGTH} characters. All other sessions will be signed out.`}
            slotProps={{ htmlInput: { minLength: MIN_PASSWORD_LENGTH } }}
          />
          {reset.error && <Alert severity="error">{getErrorMessage(reset.error)}</Alert>}
          <Button type="submit" variant="contained" loading={reset.isPending}>
            Set new password
          </Button>
        </Stack>
      )}
    </Card>
  );
}
