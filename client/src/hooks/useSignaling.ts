import { useEffect, useState } from 'react';
import { connectSignaling, type SignalingSocket } from '../services/signaling';
import type { CameraRole, SignalingCredentials } from '../types/remoteCamera';
import type { AppError } from '../utils/errors';
import { remoteCameraErrors, toSignalingError } from '../utils/errors';

export type SignalingStatus = 'idle' | 'connecting' | 'joined' | 'reconnecting' | 'error';

export interface SignalingState {
  status: SignalingStatus;
  /** The live socket once joined; null otherwise. */
  socket: SignalingSocket | null;
  role: CameraRole | null;
  peerConnected: boolean;
  /** The other peer was here and left (e.g. the phone closed the page). */
  peerLeft: boolean;
  iceServers: RTCIceServer[];
  error: AppError | null;
}

const IDLE: SignalingState = {
  status: 'idle',
  socket: null,
  role: null,
  peerConnected: false,
  peerLeft: false,
  iceServers: [],
  error: null,
};

function errorCodeOf(error: Error): string | undefined {
  const data = (error as Error & { data?: { code?: string } }).data;
  return data?.code ?? error.message;
}

/**
 * Joins a camera session on the signaling server and tracks whether the other
 * peer is present. Socket.IO reconnects by itself after network blips; an
 * authentication rejection (expired/invalid/ended session) is final.
 */
export function useSignaling(credentials: SignalingCredentials | null): SignalingState {
  const sessionId = credentials?.sessionId;
  const token = credentials?.token;
  // Stored with the session it belongs to, so a previous session's state is never shown.
  const [state, setState] = useState<{ key: string | null; value: SignalingState }>({
    key: null,
    value: IDLE,
  });
  const key = sessionId && token ? `${sessionId}:${token}` : null;

  useEffect(() => {
    if (!sessionId || !token) return;
    const currentKey = `${sessionId}:${token}`;
    const socket = connectSignaling({ sessionId, token });
    const update = (patch: Partial<SignalingState>) =>
      setState((previous) => ({
        key: currentKey,
        value: { ...(previous.key === currentKey ? previous.value : IDLE), ...patch },
      }));
    socket.on('camera:joined', ({ role, peerConnected, iceServers }) =>
      update({ status: 'joined', socket, role, peerConnected, iceServers, error: null }),
    );
    socket.on('camera:peer-joined', () => update({ peerConnected: true, peerLeft: false }));
    socket.on('camera:peer-left', () => update({ peerConnected: false, peerLeft: true }));
    socket.on('camera:session-ended', () =>
      update({ status: 'error', socket: null, error: toSignalingError('SESSION_ENDED') }),
    );
    socket.on('camera:error', ({ code }) => {
      // Message-level problems (INVALID_MESSAGE) are bugs, not user-facing states.
      if (code === 'REPLACED' || code === 'RATE_LIMITED') {
        update({ status: 'error', socket: null, error: toSignalingError(code) });
      }
    });
    socket.on('connect_error', (error) => {
      // `active` is false when the server rejected us (no automatic retry will follow).
      if (!socket.active) {
        update({
          status: 'error',
          socket: null,
          error: toSignalingError(errorCodeOf(error), error),
        });
      } else {
        update({ status: 'reconnecting', socket: null });
      }
    });
    socket.on('disconnect', () =>
      setState((previous) =>
        previous.key === currentKey && previous.value.status !== 'error'
          ? {
              key: currentKey,
              value: {
                ...previous.value,
                status: socket.active ? 'reconnecting' : 'idle',
                socket: null,
              },
            }
          : previous,
      ),
    );

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [sessionId, token]);

  if (key === null) return IDLE;
  if (state.key !== key) return { ...IDLE, status: 'connecting' };
  const { value } = state;
  return value.status === 'error' && !value.error
    ? { ...value, error: remoteCameraErrors.signalingFailed() }
    : value;
}
