import { Box, CircularProgress, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { getErrorMessage } from '../../services/apiClient';
import { ErrorState } from '../ErrorState/ErrorState';

interface QueryStateProps {
  isPending: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyMessage: string;
  onRetry: () => void;
  children: ReactNode;
}

/** Shared loading / error / empty handling for server-data views. */
export function QueryState({
  isPending,
  error,
  isEmpty,
  emptyMessage,
  onRetry,
  children,
}: QueryStateProps) {
  if (isPending) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  }
  if (error) {
    return (
      <ErrorState
        title="Could not load data"
        message={getErrorMessage(error)}
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }
  if (isEmpty) {
    return (
      <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
        {emptyMessage}
      </Typography>
    );
  }
  return <>{children}</>;
}
