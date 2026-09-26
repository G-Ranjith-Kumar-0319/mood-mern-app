import { CAMERA_RESOLUTION } from '../constants/camera';
import type { ActiveCameraInfo, CameraDevice, CameraTarget } from '../types/camera';
import { inferFacingMode, toCameraDevices, type RawVideoDevice } from '../utils/camera.utils';

/**
 * Thin wrapper around the MediaDevices API. Stateless on purpose: the
 * `useCamera` hook owns the current stream and selection.
 */

/** getUserMedia only exists in secure contexts (HTTPS or localhost) of supporting browsers. */
export function isCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function buildConstraints(target: CameraTarget): MediaStreamConstraints {
  const video: MediaTrackConstraints =
    'deviceId' in target
      ? { ...CAMERA_RESOLUTION, deviceId: { exact: target.deviceId } }
      : {
          ...CAMERA_RESOLUTION,
          // `exact` fails fast when that side has no camera, so a switch never silently
          // reopens the same one; `ideal` accepts any camera (desktop webcams report none).
          facingMode: target.strict ? { exact: target.facingMode } : { ideal: target.facingMode },
        };
  // Video only — the app never requests microphone access.
  return { video, audio: false };
}

export function openCamera(target: CameraTarget): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia(buildConstraints(target));
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function readFacingModes(device: MediaDeviceInfo): readonly string[] {
  // InputDeviceInfo.getCapabilities() is Chromium-only; elsewhere fall back to the label.
  const withCapabilities = device as MediaDeviceInfo & {
    getCapabilities?: () => MediaTrackCapabilities;
  };
  try {
    return withCapabilities.getCapabilities?.().facingMode ?? [];
  } catch {
    return [];
  }
}

/** Lists cameras. Labels (and often ids) are only available after permission is granted. */
export async function enumerateCameras(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  const raw: RawVideoDevice[] = devices.map((device) => ({
    deviceId: device.deviceId,
    kind: device.kind,
    label: device.label,
    facingModes: device.kind === 'videoinput' ? readFacingModes(device) : [],
  }));
  return toCameraDevices(raw);
}

/** Which camera the browser actually opened (a facingMode request does not say which device). */
export function getActiveCameraInfo(stream: MediaStream): ActiveCameraInfo {
  const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
  return {
    deviceId: settings.deviceId ?? null,
    facingMode: inferFacingMode('', settings.facingMode ? [settings.facingMode] : []),
  };
}

/** Subscribes to camera plug/unplug events; returns the unsubscribe function. */
export function onDeviceChange(handler: () => void): () => void {
  const mediaDevices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (!mediaDevices?.addEventListener) return () => undefined;
  mediaDevices.addEventListener('devicechange', handler);
  return () => mediaDevices.removeEventListener('devicechange', handler);
}
