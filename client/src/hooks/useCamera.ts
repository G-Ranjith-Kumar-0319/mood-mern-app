import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_FACING_MODE } from '../constants/camera';
import {
  enumerateCameras,
  getActiveCameraInfo,
  isCameraSupported,
  onDeviceChange,
  openCamera,
  stopStream,
} from '../services/camera.service';
import type { CameraDevice, CameraFacingMode, CameraStatus, CameraTarget } from '../types/camera';
import {
  chooseDefaultCamera,
  getNextCamera,
  getOppositeFacingMode,
  isMobileDevice,
} from '../utils/camera.utils';
import {
  CameraDisconnectedError,
  CameraNotSupportedError,
  toCameraError,
  type AppError,
} from '../utils/errors';

export type { CameraStatus } from '../types/camera';

export interface UseCameraOptions {
  /**
   * Which camera a phone opens first. The detector page wants the selfie camera;
   * the remote phone-camera page points the rear camera at the person.
   */
  preferredFacingMode?: 'user' | 'environment';
}

export interface UseCameraResult {
  status: CameraStatus;
  stream: MediaStream | null;
  error: AppError | null;
  /** Empty until the browser reveals devices (usually after the first permission grant). */
  cameras: CameraDevice[];
  selectedCameraId: string | null;
  facingMode: CameraFacingMode;
  isMobile: boolean;
  canSwitchCamera: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  /** Phones: front ↔ rear. Desktop: the next camera in the list. */
  switchCamera: () => Promise<void>;
  /** Remembers the choice; switches immediately if the camera is running. */
  selectCamera: (deviceId: string) => Promise<void>;
}

/** Errors meaning "that camera does not exist" — worth trying the next candidate. */
function isMissingCameraError(error: unknown): boolean {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : '';
  return name === 'OverconstrainedError' || name === 'NotFoundError';
}

function detectMobile(): boolean {
  return typeof navigator !== 'undefined' && isMobileDevice(navigator);
}

/**
 * Owns the camera: permission, device list, selection, front/rear switching,
 * plug/unplug handling and cleanup. At most one MediaStream is ever open —
 * the previous one is stopped *before* the next is requested, because many
 * phones cannot open two cameras at once.
 */
export function useCamera({
  preferredFacingMode = DEFAULT_FACING_MODE,
}: UseCameraOptions = {}): UseCameraResult {
  const [isMobile] = useState(detectMobile);
  const preferredFacing = isMobile ? preferredFacingMode : null;
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<CameraFacingMode>('unknown');

  // Refs mirror state that async callbacks and event listeners read, avoiding stale closures.
  const streamRef = useRef<MediaStream | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  // Incremented on every start/stop/switch so a slow request that resolves after the
  // user pressed "Stop", switched again, or left the page does not revive a camera.
  const requestIdRef = useRef(0);

  const select = useCallback((deviceId: string | null) => {
    selectedIdRef.current = deviceId;
    setSelectedCameraId(deviceId);
  }, []);

  const releaseStream = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
  }, []);

  const failDisconnected = useCallback(
    (remaining: CameraDevice[] | null) => {
      requestIdRef.current += 1;
      releaseStream();
      if (remaining) {
        // Pre-select another camera so "Try again" opens something that exists.
        select(chooseDefaultCamera(remaining, { preferredFacing })?.deviceId ?? null);
      }
      setError(new CameraDisconnectedError());
      setStatus('error');
    },
    [preferredFacing, releaseStream, select],
  );

  /** Tries each target in order, falling through only when a camera does not exist. */
  const open = useCallback(
    async (targets: CameraTarget[], pendingStatus: 'requesting-permission' | 'switching') => {
      if (!isCameraSupported()) {
        setError(new CameraNotSupportedError());
        setStatus('error');
        return;
      }

      const requestId = ++requestIdRef.current;
      releaseStream();
      setError(null);
      setStatus(pendingStatus);

      let lastError: unknown = null;
      for (const target of targets) {
        let mediaStream: MediaStream;
        try {
          mediaStream = await openCamera(target);
        } catch (cause) {
          if (requestId !== requestIdRef.current) return;
          lastError = cause;
          if (isMissingCameraError(cause)) continue;
          break;
        }
        if (requestId !== requestIdRef.current) {
          stopStream(mediaStream);
          return;
        }

        // Labels and ids are only reliable once permission has been granted.
        const list = await enumerateCameras().catch(() => null);
        if (requestId !== requestIdRef.current) {
          stopStream(mediaStream);
          return;
        }
        if (list) setCameras(list);

        const info = getActiveCameraInfo(mediaStream);
        const deviceId = info.deviceId ?? ('deviceId' in target ? target.deviceId : null);
        const listed = list?.find((camera) => camera.deviceId === deviceId);
        // Only a strict request proves the facing; `ideal: 'user'` also opens desktop webcams.
        const requestedFacing: CameraFacingMode =
          'facingMode' in target && target.strict ? target.facingMode : 'unknown';
        const facingCandidates: (CameraFacingMode | undefined)[] = [
          info.facingMode,
          listed?.facingMode,
          requestedFacing,
        ];
        setFacingMode(facingCandidates.find((mode) => mode && mode !== 'unknown') ?? 'unknown');
        select(deviceId);

        streamRef.current = mediaStream;
        setStream(mediaStream);
        setStatus('active');

        // Unplugged, or permission revoked mid-session. (track.stop() does not fire "ended".)
        mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
          if (streamRef.current === mediaStream) failDisconnected(null);
        });
        return;
      }

      setError(toCameraError(lastError));
      setStatus('error');
    },
    [failDisconnected, releaseStream, select],
  );

  const startCamera = useCallback(() => {
    const preferred: CameraTarget = { facingMode: preferredFacingMode, strict: false };
    const selectedId = selectedIdRef.current;
    // A remembered camera may have been unplugged; fall back to any front-ish camera.
    return open(
      selectedId ? [{ deviceId: selectedId }, preferred] : [preferred],
      'requesting-permission',
    );
  }, [open, preferredFacingMode]);

  const stopCamera = useCallback(() => {
    requestIdRef.current += 1;
    releaseStream();
    setError(null);
    setStatus('idle');
  }, [releaseStream]);

  const switchCamera = useCallback(() => {
    const next = getNextCamera(cameras, selectedIdRef.current);
    const byDevice: CameraTarget[] = next ? [{ deviceId: next.deviceId }] : [];
    if (!isMobile) return next ? open(byDevice, 'switching') : Promise.resolve();
    // facingMode is more reliable than labels on phones (labels are localised or vague);
    // if that side has no camera, fall back to the next device in the list.
    return open(
      [{ facingMode: getOppositeFacingMode(facingMode), strict: true }, ...byDevice],
      'switching',
    );
  }, [cameras, facingMode, isMobile, open]);

  const selectCamera = useCallback(
    async (deviceId: string) => {
      if (deviceId === selectedIdRef.current) return;
      select(deviceId);
      if (streamRef.current) await open([{ deviceId }], 'switching');
    },
    [open, select],
  );

  // Initial device list (labelled if permission was granted before) + plug/unplug events.
  useEffect(() => {
    if (!isCameraSupported()) return;
    let cancelled = false;

    const refresh = async () => {
      const list = await enumerateCameras().catch(() => null);
      if (cancelled || !list) return;
      setCameras(list);

      const selectedId = selectedIdRef.current;
      if (selectedId && list.some((camera) => camera.deviceId === selectedId)) return;
      if (streamRef.current && selectedId) {
        failDisconnected(list);
        return;
      }
      select(
        chooseDefaultCamera(list, { preferredId: selectedId, preferredFacing })?.deviceId ?? null,
      );
    };

    void refresh();
    const unsubscribe = onDeviceChange(() => void refresh());
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [failDisconnected, preferredFacing, select]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  return {
    status,
    stream,
    error,
    cameras,
    selectedCameraId,
    facingMode,
    isMobile,
    canSwitchCamera: cameras.length > 1,
    startCamera,
    stopCamera,
    switchCamera,
    selectCamera,
  };
}
