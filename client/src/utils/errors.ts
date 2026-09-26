/**
 * Typed frontend errors. Each carries a stable `code` so UI components can
 * choose a message/action without parsing error strings.
 */
export type AppErrorCode =
  | 'CAMERA_PERMISSION_DENIED'
  | 'CAMERA_NOT_SUPPORTED'
  | 'CAMERA_NOT_FOUND'
  | 'CAMERA_IN_USE'
  | 'CAMERA_DISCONNECTED'
  | 'CAMERA_UNKNOWN'
  | 'MODEL_LOAD_FAILED'
  | 'INFERENCE_FAILED'
  | 'NETWORK_ERROR'
  | 'WEBRTC_NOT_SUPPORTED'
  | 'WEBRTC_FAILED'
  | 'PHONE_DISCONNECTED'
  | 'LAPTOP_DISCONNECTED'
  | 'CAMERA_SESSION_EXPIRED'
  | 'CAMERA_SESSION_INVALID'
  | 'CAMERA_SESSION_ENDED'
  | 'CAMERA_SESSION_REPLACED'
  | 'SIGNALING_FAILED';

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(code: AppErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class CameraPermissionError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super(
      'CAMERA_PERMISSION_DENIED',
      'Camera permission was denied. Please allow camera access in your browser settings and try again.',
      options,
    );
  }
}

export class CameraNotSupportedError extends AppError {
  constructor() {
    super(
      'CAMERA_NOT_SUPPORTED',
      'Camera access is not supported by this browser. Please use a modern browser such as Chrome, Edge, Safari or Firefox, over HTTPS (or localhost).',
    );
  }
}

export class CameraError extends AppError {}

export class CameraDisconnectedError extends AppError {
  constructor() {
    super('CAMERA_DISCONNECTED', 'The camera was disconnected. Please select another camera.');
  }
}

export class ModelLoadError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super(
      'MODEL_LOAD_FAILED',
      'The expression model could not be loaded. Check your connection and reload the page.',
      options,
    );
  }
}

export class InferenceError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super('INFERENCE_FAILED', 'Expression detection failed on this device.', options);
  }
}

export class NetworkError extends AppError {
  constructor(options?: { cause?: unknown }) {
    super('NETWORK_ERROR', 'Could not reach the server. Check your connection.', options);
  }
}

/** Maps a `getUserMedia` rejection (a DOMException) to a typed camera error. */
export function toCameraError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  // DOMException is not guaranteed to extend Error in every environment, so read `name` structurally.
  const name =
    typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraPermissionError({ cause: error });
    case 'NotFoundError':
      return new CameraError('CAMERA_NOT_FOUND', 'No camera was detected on this device.', {
        cause: error,
      });
    case 'OverconstrainedError':
      // The requested device/facing mode does not exist (e.g. a remembered camera was unplugged).
      return new CameraError(
        'CAMERA_NOT_FOUND',
        'The selected camera is not available. Please select another camera.',
        { cause: error },
      );
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError(
        'CAMERA_IN_USE',
        'The selected camera is currently unavailable. Please close other applications using the camera and try again.',
        { cause: error },
      );
    default:
      return new CameraError('CAMERA_UNKNOWN', 'The camera could not be started.', {
        cause: error,
      });
  }
}

/** Phone camera (WebRTC) errors. */
export const remoteCameraErrors = {
  notSupported: () =>
    new AppError(
      'WEBRTC_NOT_SUPPORTED',
      'Your browser does not support the required camera features (WebRTC). Please use a recent version of Chrome, Edge, Safari or Firefox.',
    ),
  connectionFailed: () =>
    new AppError(
      'WEBRTC_FAILED',
      'WebRTC connection failed. Check your network connection. On different networks a TURN server may be required.',
    ),
  phoneDisconnected: () =>
    new AppError('PHONE_DISCONNECTED', 'Phone disconnected. Please reconnect your phone.'),
  laptopDisconnected: () =>
    new AppError(
      'LAPTOP_DISCONNECTED',
      'The laptop disconnected. Streaming resumes automatically when it reconnects.',
    ),
  signalingFailed: (cause?: unknown) =>
    new AppError(
      'SIGNALING_FAILED',
      'Could not reach the server to connect the phone camera. Check your connection.',
      { cause },
    ),
};

const SIGNALING_ERROR_CODES: Record<string, AppErrorCode> = {
  SESSION_EXPIRED: 'CAMERA_SESSION_EXPIRED',
  SESSION_INVALID: 'CAMERA_SESSION_INVALID',
  SESSION_ENDED: 'CAMERA_SESSION_ENDED',
  REPLACED: 'CAMERA_SESSION_REPLACED',
};

const SIGNALING_ERROR_MESSAGES: Partial<Record<AppErrorCode, string>> = {
  CAMERA_SESSION_EXPIRED: 'Camera session expired. Please generate a new QR code.',
  CAMERA_SESSION_INVALID: 'This camera link is not valid. Please scan the QR code again.',
  CAMERA_SESSION_ENDED: 'This camera session was closed on the laptop. Please scan a new QR code.',
  CAMERA_SESSION_REPLACED: 'This camera session was opened in another tab or device.',
};

/** Maps a signaling server error code (e.g. from `connect_error`) to a typed error. */
export function toSignalingError(serverCode: string | undefined, cause?: unknown): AppError {
  const code = serverCode ? SIGNALING_ERROR_CODES[serverCode] : undefined;
  const message = code ? SIGNALING_ERROR_MESSAGES[code] : undefined;
  return code && message
    ? new AppError(code, message, { cause })
    : remoteCameraErrors.signalingFailed(cause);
}
