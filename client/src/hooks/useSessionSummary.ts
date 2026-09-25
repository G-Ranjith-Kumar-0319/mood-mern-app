import { useCallback, useEffect, useRef, useState } from 'react';
import type { Expression } from '../constants/expressions';
import { SessionRecorder, type SessionSummary } from '../utils/sessionRecorder';

/** Sessions shorter than this are not worth summarising (e.g. an accidental click). */
const MIN_SESSION_MS = 3000;

/**
 * Records which expression was shown for how long while the camera runs, and
 * produces a summary when the camera stops. Nothing here is sent to the server.
 */
export function useSessionSummary(cameraActive: boolean, current: Expression | null) {
  const recorderRef = useRef<SessionRecorder | null>(null);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  useEffect(() => {
    if (cameraActive) {
      recorderRef.current = new SessionRecorder(Date.now());
      return;
    }
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;
    const finished = recorder.finish(Date.now());
    if (finished.durationMs >= MIN_SESSION_MS) setSummary(finished);
  }, [cameraActive]);

  useEffect(() => {
    recorderRef.current?.update(current, Date.now());
  }, [current]);

  const dismiss = useCallback(() => setSummary(null), []);
  return { summary, dismiss };
}
