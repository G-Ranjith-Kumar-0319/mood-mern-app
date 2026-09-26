import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../services/apiClient';
import type { CameraSession } from '../types/remoteCamera';
import { AppError, NetworkError, remoteCameraErrors, toSignalingError } from '../utils/errors';
import { useCameraSession } from './useCameraSession';
import { useSignaling } from './useSignaling';
import { useWebRTC } from './useWebRTC';

export type PhoneCameraStatus =
  | 'off'
  | 'creating-session'
  | 'waiting-for-phone'
  | 'phone-connected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'phone-disconnected'
  | 'error';

export interface UsePhoneCameraResult {
  status: PhoneCameraStatus;
  session: CameraSession | null;
  remoteStream: MediaStream | null;
  error: AppError | null;
  /** Creates (or resumes, after a page refresh) a pairing session. */
  start: () => void;
  /** Ends the session: the phone is disconnected and the QR code stops working. */
  stop: () => void;
  /** Ends the current session and shows a new QR code. */
  regenerate: () => void;
}

/** True once `iso` is in the past (re-renders at that moment). */
function useIsPast(iso: string | undefined): boolean {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    // Also scheduled (with 0 ms) when already past, so `now` catches up either way.
    const remaining = Math.max(0, Date.parse(iso) - Date.now());
    const timer = setTimeout(() => setNow(Date.now()), remaining);
    return () => clearTimeout(timer);
  }, [iso]);
  return iso !== undefined && Date.parse(iso) <= now;
}

function toSessionError(cause: unknown): AppError {
  if (cause instanceof AppError) return cause;
  if (cause instanceof ApiError) return new NetworkError({ cause });
  return remoteCameraErrors.signalingFailed(cause);
}

/**
 * Laptop side of the phone camera: pairing session → signaling → WebRTC.
 * The result's `remoteStream` is shown in the same <video> the local camera
 * uses, so the expression detector does not know or care where it came from.
 */
export function usePhoneCamera(): UsePhoneCameraResult {
  const cameraSession = useCameraSession();
  const { session, isCreating, error: sessionError } = cameraSession;
  const credentials = useMemo(
    () => (session ? { sessionId: session.sessionId, token: session.hostToken } : null),
    [session],
  );
  const signaling = useSignaling(credentials);
  const webrtc = useWebRTC({ role: 'host', signaling });
  const expired = useIsPast(session?.expiresAt);

  const { socket } = signaling;
  const { ensure, regenerate: createNew, clear } = cameraSession;
  const endSession = useCallback(() => socket?.emit('camera:end-session'), [socket]);

  const start = useCallback(() => void ensure(), [ensure]);
  const stop = useCallback(() => {
    endSession();
    clear();
  }, [endSession, clear]);
  const regenerate = useCallback(() => {
    endSession();
    void createNew();
  }, [endSession, createNew]);

  let status: PhoneCameraStatus;
  let error: AppError | null = null;
  if (!session) {
    status = isCreating ? 'creating-session' : sessionError ? 'error' : 'off';
    if (sessionError) error = toSessionError(sessionError);
  } else if (signaling.status === 'error') {
    status = 'error';
    error = signaling.error;
  } else if (webrtc.status === 'failed') {
    status = 'error';
    error = remoteCameraErrors.connectionFailed();
  } else if (webrtc.status === 'connected') {
    status = 'connected';
  } else if (webrtc.status === 'disconnected') {
    status = 'reconnecting';
  } else if (webrtc.status === 'connecting') {
    status = 'connecting';
  } else if (signaling.peerConnected) {
    status = 'phone-connected';
  } else if (expired) {
    // An established stream outlives the QR code; only an unused/abandoned link expires.
    status = 'error';
    error = toSignalingError('SESSION_EXPIRED');
  } else {
    status = signaling.peerLeft ? 'phone-disconnected' : 'waiting-for-phone';
  }

  return {
    status,
    session,
    remoteStream: status === 'connected' || status === 'reconnecting' ? webrtc.remoteStream : null,
    error,
    start,
    stop,
    regenerate,
  };
}
