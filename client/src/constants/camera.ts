/**
 * `ideal` values are hints; the browser picks the closest supported mode.
 * 640×480 is plenty for the face detector and keeps inference cheap.
 */
export const CAMERA_RESOLUTION = {
  width: { ideal: 640 },
  height: { ideal: 480 },
} as const satisfies MediaTrackConstraints;

/** Expression detection needs to see the user, so the selfie camera is the default. */
export const DEFAULT_FACING_MODE = 'user';
