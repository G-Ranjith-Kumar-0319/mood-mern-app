import { Alert, Button, Link as MuiLink, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useLogin, useRegister } from '../../hooks/useAuth';
import { getErrorMessage } from '../../services/apiClient';

const MIN_PASSWORD_LENGTH = 8;

interface AuthPageProps {
  mode: 'login' | 'register';
}

/** Sign-in and registration share one accessible form. */
export function AuthPage({ mode }: AuthPageProps) {
  const isRegister = mode === 'register';
  const navigate = useNavigate();
  const login = useLogin();
  const register = useRegister();
  const mutation = isRegister ? register : login;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const onSuccess = () => void navigate('/');
    if (isRegister) {
      register.mutate(
        { email, password, displayName: displayName.trim() || undefined },
        { onSuccess },
      );
    } else {
      login.mutate({ email, password }, { onSuccess });
    }
  };

  return (
    <Paper variant="outlined" sx={{ maxWidth: 420, mx: 'auto', p: { xs: 3, sm: 4 } }}>
      <Stack component="form" spacing={2.5} onSubmit={handleSubmit} noValidate={false}>
        <Typography variant="h5" component="h1">
          {isRegister ? 'Create an account' : 'Sign in'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          An account keeps your detection history private to you. Detection works without one.
        </Typography>

        {mutation.error && (
          <Alert severity="error" role="alert">
            {getErrorMessage(mutation.error)}
          </Alert>
        )}

        {isRegister && (
          <TextField
            label="Display name (optional)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="nickname"
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
        )}
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          required
          helperText={isRegister ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
          slotProps={{ htmlInput: { minLength: isRegister ? MIN_PASSWORD_LENGTH : undefined } }}
        />
        <Button type="submit" variant="contained" size="large" loading={mutation.isPending}>
          {isRegister ? 'Create account' : 'Sign in'}
        </Button>
        {!isRegister && (
          <MuiLink
            component={Link}
            to="/forgot-password"
            variant="body2"
            sx={{ textAlign: 'center' }}
          >
            Forgot your password?
          </MuiLink>
        )}
        <Typography variant="body2" sx={{ textAlign: 'center' }}>
          {isRegister ? 'Already have an account? ' : 'New here? '}
          <MuiLink component={Link} to={isRegister ? '/login' : '/register'}>
            {isRegister ? 'Sign in' : 'Create an account'}
          </MuiLink>
        </Typography>
      </Stack>
    </Paper>
  );
}
