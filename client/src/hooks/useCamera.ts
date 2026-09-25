import { useCallback, useEffect, useRef, useState } from 'react';
import { CAMERA_CONSTRAINTS } from '../constants/camera';
import { CameraNotSupportedError, toCameraError, type AppError } from '../utils/errors';

export type CameraStatus = 'off' | 'requesting' | 'active' | 'error';

export interface UseCameraResult {
  status: CameraStatus;
  stream: MediaStream | null;
  error: AppError | null;
  start: () => Promise<void>;
  stop: () => void;
}

export function isCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Owns the webcam MediaStream: permission request, start/stop and cleanup.
 * Every track is stopped on `stop()` and on unmount so the browser's
 * camera-in-use light turns off.
 */
export function useCamera(): UseCameraResult {
  const [status, setStatus] = useState<CameraStatus>('off');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<AppError | null>(null);

  // A ref mirrors the stream so cleanup never reads a stale closure value.
  const streamRef = useRef<MediaStream | null>(null);
  // Incremented on every start/stop so a slow permission prompt that resolves
  // after the user pressed "Stop" (or left the page) does not revive the camera.
  const requestIdRef = useRef(0);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    stopTracks(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setStatus('off');
  }, []);

  const start = useCallback(async () => {
    if (!isCameraSupported()) {
      setError(new CameraNotSupportedError());
      setStatus('error');
      return;
    }

    const requestId = ++requestIdRef.current;
    setError(null);
    setStatus('requesting');

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      if (requestId !== requestIdRef.current) {
        stopTracks(mediaStream);
        return;
      }
      stopTracks(streamRef.current);
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setStatus('active');

      // If the user revokes permission or unplugs the camera mid-session.
      mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (streamRef.current === mediaStream) stop();
      });
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      setError(toCameraError(cause));
      setStatus('error');
    }
  }, [stop]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      stopTracks(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  return { status, stream, error, start, stop };
}
