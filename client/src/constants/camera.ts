/**
 * Video only — the app never requests microphone access.
 * `ideal` values are hints; the browser picks the closest supported mode.
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: {
    facingMode: 'user',
    width: { ideal: 640 },
    height: { ideal: 480 },
  },
};
