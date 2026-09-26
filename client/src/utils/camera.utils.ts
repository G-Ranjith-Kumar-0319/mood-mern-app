import type { CameraDevice, CameraFacingMode } from '../types/camera';

/** The subset of MediaDeviceInfo (plus InputDeviceInfo's optional facing modes) the app reads. */
export interface RawVideoDevice {
  deviceId: string;
  kind: string;
  label: string;
  /** From InputDeviceInfo.getCapabilities() where the browser supports it. */
  facingModes?: readonly string[];
}

// Labels are localised and vendor-specific, so these only cover common English patterns:
// iOS "Front Camera"/"Back Camera", Android "camera2 1, facing front", "FaceTime HD Camera".
const FRONT_LABEL = /\b(front|user|selfie|facetime)\b/i;
const REAR_LABEL = /\b(back|rear|environment|world)\b/i;

export function inferFacingMode(
  label: string,
  facingModes: readonly string[] = [],
): CameraFacingMode {
  if (facingModes.includes('user')) return 'user';
  if (facingModes.includes('environment')) return 'environment';
  if (FRONT_LABEL.test(label)) return 'user';
  if (REAR_LABEL.test(label)) return 'environment';
  return 'unknown';
}

/**
 * Keeps video inputs only and gives each a readable label.
 * Before permission is granted, browsers return empty labels and often empty
 * device ids; an entry without an id cannot be selected, so it is dropped.
 */
export function toCameraDevices(devices: readonly RawVideoDevice[]): CameraDevice[] {
  const seen = new Set<string>();
  return devices
    .filter((device) => device.kind === 'videoinput' && device.deviceId !== '')
    .filter((device) => {
      if (seen.has(device.deviceId)) return false;
      seen.add(device.deviceId);
      return true;
    })
    .map((device, index) => {
      const label = device.label.trim();
      return {
        deviceId: device.deviceId,
        label: label || `Camera ${index + 1}`,
        facingMode: inferFacingMode(label, device.facingModes),
      };
    });
}

export interface DefaultCameraOptions {
  /** Keep this camera if it is still connected (e.g. the user's last choice). */
  preferredId?: string | null;
  /** On phones, the side to prefer (null on desktop, where webcams report no side). */
  preferredFacing: 'user' | 'environment' | null;
}

/** Previous choice if still present; else a camera facing the preferred way; else the first. */
export function chooseDefaultCamera(
  cameras: readonly CameraDevice[],
  { preferredId, preferredFacing }: DefaultCameraOptions,
): CameraDevice | null {
  const preferred = cameras.find((camera) => camera.deviceId === preferredId);
  if (preferred) return preferred;
  const facing = preferredFacing
    ? cameras.find((camera) => camera.facingMode === preferredFacing)
    : undefined;
  return facing ?? cameras[0] ?? null;
}

/** The camera after `currentId` in the list, wrapping around; null when there is no other camera. */
export function getNextCamera(
  cameras: readonly CameraDevice[],
  currentId: string | null,
): CameraDevice | null {
  if (cameras.length < 2) return null;
  const index = cameras.findIndex((camera) => camera.deviceId === currentId);
  return cameras[(index + 1) % cameras.length] ?? null;
}

/** Unknown counts as front because the app opens the selfie camera by default. */
export function getOppositeFacingMode(facingMode: CameraFacingMode): 'user' | 'environment' {
  return facingMode === 'environment' ? 'user' : 'environment';
}

/** The front camera is mirrored like a mirror; a rear (or unknown external) camera is shown as-is. */
export function shouldMirror(facingMode: CameraFacingMode): boolean {
  return facingMode !== 'environment';
}

export interface NavigatorLike {
  userAgent: string;
  maxTouchPoints?: number;
  userAgentData?: { mobile?: boolean };
}

const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobi/i;

/**
 * Phone/tablet detection, used to choose the front camera by default and to show
 * a "Switch camera" button instead of a device dropdown.
 */
export function isMobileDevice(nav: NavigatorLike): boolean {
  if (nav.userAgentData?.mobile) return true;
  if (MOBILE_USER_AGENT.test(nav.userAgent)) return true;
  // iPadOS reports a desktop Safari user agent; touch support gives it away.
  return /Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1;
}
