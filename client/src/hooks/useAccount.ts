import { useMutation, useQueryClient } from '@tanstack/react-query';
import { accountApi } from '../services/accountApi';
import type { RetentionDays, User } from '../types/api';
import { authKeys, useSessionChange } from './useAuth';
import { expressionKeys } from './useExpressionHistory';

/** Account mutations. Each keeps the cached current user in sync with the server's answer. */
export function useUpdateRetention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (retentionDays: RetentionDays) => accountApi.updateSettings({ retentionDays }),
    onSuccess: (user: User) => {
      queryClient.setQueryData(authKeys.me, user);
      void queryClient.invalidateQueries({ queryKey: expressionKeys.all });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: accountApi.changePassword,
    onSuccess: (user: User) => queryClient.setQueryData(authKeys.me, user),
  });
}

export function useDeleteAccount() {
  const onSessionChange = useSessionChange();
  return useMutation({
    mutationFn: (password: string) => accountApi.deleteAccount(password),
    onSuccess: () => onSessionChange(null),
  });
}

export function useRequestEmailVerification() {
  return useMutation({ mutationFn: accountApi.requestEmailVerification });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => accountApi.verifyEmail(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: authKeys.me }),
  });
}

export function useRequestPasswordReset() {
  return useMutation({ mutationFn: (email: string) => accountApi.requestPasswordReset(email) });
}

export function useResetPassword() {
  const onSessionChange = useSessionChange();
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) =>
      accountApi.resetPassword(token, password),
    onSuccess: onSessionChange,
  });
}
