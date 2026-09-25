import { Alert, AlertTitle, Button } from '@mui/material';

interface ErrorStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Consistent, accessible error presentation (role="alert" is announced by screen readers). */
export function ErrorState({ title, message, actionLabel, onAction }: ErrorStateProps) {
  return (
    <Alert
      severity="error"
      role="alert"
      action={
        actionLabel && onAction ? (
          <Button color="inherit" size="small" onClick={onAction}>
            {actionLabel}
          </Button>
        ) : undefined
      }
    >
      <AlertTitle>{title}</AlertTitle>
      {message}
    </Alert>
  );
}
