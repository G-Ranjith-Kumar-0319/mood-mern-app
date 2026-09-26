import type { AppError, AppErrorCode } from '../../utils/errors';
import { ErrorState } from '../ErrorState/ErrorState';

const TITLES: Partial<Record<AppErrorCode, string>> = {
  CAMERA_PERMISSION_DENIED: 'Camera permission needed',
  CAMERA_NOT_SUPPORTED: 'Camera not supported',
  CAMERA_NOT_FOUND: 'No camera found',
  CAMERA_IN_USE: 'Camera unavailable',
  CAMERA_DISCONNECTED: 'Camera disconnected',
  WEBRTC_NOT_SUPPORTED: 'Browser not supported',
  WEBRTC_FAILED: 'Phone connection failed',
  PHONE_DISCONNECTED: 'Phone disconnected',
  CAMERA_SESSION_EXPIRED: 'Camera session expired',
  CAMERA_SESSION_INVALID: 'Invalid camera link',
  CAMERA_SESSION_ENDED: 'Camera session closed',
  CAMERA_SESSION_REPLACED: 'Camera session opened elsewhere',
  SIGNALING_FAILED: 'Cannot reach the server',
  NETWORK_ERROR: 'Cannot reach the server',
};

interface CameraPermissionErrorProps {
  error: AppError;
  onRetry: () => void;
  retryLabel?: string;
}

/** Camera and phone-camera errors with a specific title; retrying is pointless without browser support. */
export function CameraPermissionError({
  error,
  onRetry,
  retryLabel = 'Try again',
}: CameraPermissionErrorProps) {
  return (
    <ErrorState
      title={TITLES[error.code] ?? 'Camera unavailable'}
      message={error.message}
      actionLabel={
        error.code === 'CAMERA_NOT_SUPPORTED' || error.code === 'WEBRTC_NOT_SUPPORTED'
          ? undefined
          : retryLabel
      }
      onAction={onRetry}
    />
  );
}
