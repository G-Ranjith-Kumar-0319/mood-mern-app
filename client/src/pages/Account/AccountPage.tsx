import DownloadIcon from '@mui/icons-material/Download';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import {
  useChangePassword,
  useDeleteAccount,
  useRequestEmailVerification,
  useUpdateRetention,
} from '../../hooks/useAccount';
import { useCurrentUser } from '../../hooks/useAuth';
import { EXPORT_URL } from '../../services/accountApi';
import { getErrorMessage } from '../../services/apiClient';
import { RETENTION_OPTIONS, type RetentionDays, type User } from '../../types/api';

const MIN_PASSWORD_LENGTH = 8;
const KEEP = 'keep';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          {title}
        </Typography>
        {children}
      </Stack>
    </Paper>
  );
}

function ProfileSection({ user }: { user: User }) {
  const resend = useRequestEmailVerification();
  return (
    <Section title="Profile">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography>{user.email}</Typography>
        <Chip
          size="small"
          color={user.emailVerified ? 'success' : 'warning'}
          label={user.emailVerified ? 'Verified' : 'Not verified'}
        />
      </Stack>
      {user.displayName && <Typography color="text.secondary">{user.displayName}</Typography>}
      {!user.emailVerified && (
        <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
          <Button size="small" onClick={() => resend.mutate()} loading={resend.isPending}>
            Re-send verification email
          </Button>
          {resend.isSuccess && (
            <Alert severity="success">Sent. Check your inbox for the verification link.</Alert>
          )}
          {resend.error && <Alert severity="error">{getErrorMessage(resend.error)}</Alert>}
        </Stack>
      )}
    </Section>
  );
}

function RetentionSection({ user }: { user: User }) {
  const update = useUpdateRetention();
  const value = user.retentionDays === null ? KEEP : String(user.retentionDays);
  return (
    <Section title="Data retention">
      <FormControl size="small" sx={{ maxWidth: 320 }}>
        <InputLabel id="retention-label">Delete my detections after</InputLabel>
        <Select
          labelId="retention-label"
          label="Delete my detections after"
          value={value}
          disabled={update.isPending}
          onChange={(event) => {
            const next: RetentionDays =
              event.target.value === KEEP
                ? null
                : (Number(event.target.value) as (typeof RETENTION_OPTIONS)[number]);
            update.mutate(next);
          }}
        >
          <MenuItem value={KEEP}>Never (keep until I delete them)</MenuItem>
          {RETENTION_OPTIONS.map((days) => (
            <MenuItem key={days} value={String(days)}>
              {days} days
            </MenuItem>
          ))}
        </Select>
        <FormHelperText>
          Applies to existing detections too. Older ones are removed automatically within about a
          minute.
        </FormHelperText>
      </FormControl>
      {update.isSuccess && <Alert severity="success">Retention updated.</Alert>}
      {update.error && <Alert severity="error">{getErrorMessage(update.error)}</Alert>}
    </Section>
  );
}

function ExportSection() {
  return (
    <Section title="Export your data">
      <Typography color="text.secondary">
        Download your account details and every saved detection as a JSON file.
      </Typography>
      <Button
        variant="outlined"
        startIcon={<DownloadIcon />}
        href={EXPORT_URL}
        download
        sx={{ alignSelf: 'flex-start' }}
      >
        Download my data
      </Button>
    </Section>
  );
}

function PasswordSection() {
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('');
          setNewPassword('');
        },
      },
    );
  };

  return (
    <Section title="Change password">
      <Stack component="form" spacing={2} onSubmit={handleSubmit} sx={{ maxWidth: 360 }}>
        <TextField
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          size="small"
        />
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          size="small"
          helperText={`At least ${MIN_PASSWORD_LENGTH} characters`}
          slotProps={{ htmlInput: { minLength: MIN_PASSWORD_LENGTH } }}
        />
        <Button
          type="submit"
          variant="contained"
          loading={change.isPending}
          sx={{ alignSelf: 'flex-start' }}
        >
          Change password
        </Button>
        {change.isSuccess && (
          <Alert severity="success">Password changed. Your other devices were signed out.</Alert>
        )}
        {change.error && <Alert severity="error">{getErrorMessage(change.error)}</Alert>}
      </Stack>
    </Section>
  );
}

function DeleteSection() {
  const remove = useDeleteAccount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');

  const handleDelete = (event: FormEvent) => {
    event.preventDefault();
    remove.mutate(password, { onSuccess: () => void navigate('/', { replace: true }) });
  };

  return (
    <Section title="Delete account">
      <Typography color="text.secondary">
        Permanently deletes your account and all of your saved detections. This cannot be undone.
      </Typography>
      <Button
        color="error"
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{ alignSelf: 'flex-start' }}
      >
        Delete my account
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="xs">
        <form onSubmit={handleDelete}>
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <DialogContentText>
                Enter your password to confirm. Your account and every saved detection will be
                deleted immediately.
              </DialogContentText>
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              {remove.error && <Alert severity="error">{getErrorMessage(remove.error)}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" color="error" variant="contained" loading={remove.isPending}>
              Delete permanently
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Section>
  );
}

/** Profile, retention, export, password and deletion — signed-in users only. */
export function AccountPage() {
  const { data: user, isPending } = useCurrentUser();

  if (isPending) return <CircularProgress aria-label="Loading" />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Typography variant="h4" component="h1">
        Your account
      </Typography>
      <ProfileSection user={user} />
      <RetentionSection user={user} />
      <ExportSection />
      <PasswordSection />
      <DeleteSection />
    </Stack>
  );
}
