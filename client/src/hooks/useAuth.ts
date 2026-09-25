import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, type Credentials, type Registration } from '../services/authApi';
import type { User } from '../types/api';
import { expressionKeys } from './useExpressionHistory';

export const authKeys = { me: ['auth', 'me'] as const };

/**
 * The signed-in user is server state like any other, so it lives in the
 * TanStack Query cache — no separate auth context or global store needed.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: ({ signal }) => authApi.me(signal),
    staleTime: 5 * 60 * 1000,
  });
}

export function useSessionChange() {
  const queryClient = useQueryClient();
  return (user: User | null) => {
    queryClient.setQueryData(authKeys.me, user);
    // History/stats belong to the previous identity: drop them and refetch what is on screen.
    void queryClient.resetQueries({ queryKey: expressionKeys.all });
  };
}

export function useLogin() {
  const onSessionChange = useSessionChange();
  return useMutation({
    mutationFn: (credentials: Credentials) => authApi.login(credentials),
    onSuccess: onSessionChange,
  });
}

export function useRegister() {
  const onSessionChange = useSessionChange();
  return useMutation({
    mutationFn: (registration: Registration) => authApi.register(registration),
    onSuccess: onSessionChange,
  });
}

export function useLogout() {
  const onSessionChange = useSessionChange();
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSettled: () => onSessionChange(null),
  });
}
