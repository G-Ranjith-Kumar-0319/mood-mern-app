import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../services/apiClient';
import { expressionKeys } from './useExpressionHistory';

export type LiveStatus = 'connecting' | 'live' | 'unsupported';

export const EVENTS_URL = `${API_BASE_URL}/expressions/events`;
/** Several saves in a burst (auto-save + another tab) trigger just one refetch. */
const REFRESH_DEBOUNCE_MS = 300;

/**
 * Subscribes to the server's event stream (Server-Sent Events). When a detection
 * is saved — in this tab, another tab or another device — history and statistics
 * refresh automatically. EventSource reconnects by itself after network drops.
 *
 * `identity` (the user id or "anonymous") re-opens the stream when the user
 * signs in or out, because the server scopes events by the session cookie.
 */
export function useLiveUpdates(identity: string): LiveStatus {
  const queryClient = useQueryClient();
  // The status belongs to one identity; a new identity starts as "connecting" (derived below).
  const [state, setState] = useState<{ identity: string; status: LiveStatus } | null>(null);

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource(EVENTS_URL);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    source.onopen = () => setState({ identity, status: 'live' });
    // The browser retries automatically; show "connecting" in the meantime.
    source.onerror = () => setState({ identity, status: 'connecting' });
    source.addEventListener('detection.created', () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(
        () => void queryClient.invalidateQueries({ queryKey: expressionKeys.all }),
        REFRESH_DEBOUNCE_MS,
      );
    });

    return () => {
      clearTimeout(refreshTimer);
      source.close();
    };
  }, [identity, queryClient]);

  if (typeof EventSource === 'undefined') return 'unsupported';
  return state?.identity === identity ? state.status : 'connecting';
}
