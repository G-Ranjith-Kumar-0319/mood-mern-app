/** "user" = front/selfie camera, "environment" = rear camera. */
export type CameraFacingMode = 'user' | 'environment' | 'unknown';

export interface CameraDevice {
  deviceId: string;
  /** Browser label, or a fallback such as "Camera 2" when the browser hides it. */
  label: string;
  facingMode: CameraFacingMode;
}

export type CameraStatus = 'idle' | 'requesting-permission' | 'active' | 'switching' | 'error';

/**
 * What to open: a specific device, or a camera facing this way.
 * `strict` requires that facing mode instead of merely preferring it.
 */
export type CameraTarget =
  { deviceId: string } | { facingMode: 'user' | 'environment'; strict: boolean };

/** Details of the camera that is actually streaming (read from the live track). */
export interface ActiveCameraInfo {
  deviceId: string | null;
  facingMode: CameraFacingMode;
}
