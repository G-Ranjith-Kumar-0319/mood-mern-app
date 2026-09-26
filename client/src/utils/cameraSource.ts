import type { PhoneCameraStatus } from '../hooks/usePhoneCamera';
import type { CameraStatus } from '../types/camera';

/**
 * A phone connection expressed in the local camera's vocabulary, so the
 * detector view state and the detection loop treat every source the same way.
 * "reconnecting" stays active: frames may resume without a new connection.
 */
export function phoneToCameraStatus(status: PhoneCameraStatus): CameraStatus {
  switch (status) {
    case 'connected':
    case 'reconnecting':
      return 'active';
    case 'error':
      return 'error';
    default:
      return 'idle';
  }
}

/** Worth downloading the model already: a phone is paired and about to stream. */
export function isPhoneAboutToStream(status: PhoneCameraStatus): boolean {
  return status === 'phone-connected' || status === 'connecting';
}
