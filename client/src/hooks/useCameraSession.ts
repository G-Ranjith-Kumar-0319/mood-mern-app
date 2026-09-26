import { useCallback, useState } from 'react';
import { cameraSessionApi } from '../services/cameraSessionApi';
import type { CameraSession } from '../types/remoteCamera';

/** Per tab: a refreshed laptop page rejoins the same session, so the phone keeps streaming. */
const STORAGE_KEY = 'expression-detector:camera-session:v1';

function isUnexpired(session: CameraSession, now = Date.now()): boolean {
  return Date.parse(session.expiresAt) > now;
}

function readStored(): CameraSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as CameraSession;
    return isUnexpired(session) ? session : null;
  } catch {
    return null;
  }
}

function store(session: CameraSession | null) {
  try {
    if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the session then just doesn't survive a refresh.
  }
}

export interface UseCameraSessionResult {
  session: CameraSession | null;
  isCreating: boolean;
  error: unknown;
  /** Reuses an unexpired session from this tab, otherwise creates one. */
  ensure: () => Promise<void>;
  /** Always creates a new session (new QR code). */
  regenerate: () => Promise<void>;
  clear: () => void;
}

export function useCameraSession(): UseCameraSessionResult {
  const [session, setSession] = useState<CameraSession | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const regenerate = useCallback(async () => {
    setIsCreating(true);
    setError(null);
    try {
      const created = await cameraSessionApi.create();
      store(created);
      setSession(created);
    } catch (cause) {
      setError(cause);
    } finally {
      setIsCreating(false);
    }
  }, []);

  const ensure = useCallback(async () => {
    const stored = readStored();
    if (stored) {
      setSession(stored);
      return;
    }
    await regenerate();
  }, [regenerate]);

  const clear = useCallback(() => {
    store(null);
    setSession(null);
    setError(null);
  }, []);

  return { session, isCreating, error, ensure, regenerate, clear };
}
