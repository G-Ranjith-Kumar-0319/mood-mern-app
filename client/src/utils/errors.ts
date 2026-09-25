/**
 * Typed frontend errors. Each carries a stable `code` so UI components can
 * choose a message/action without parsing error strings.
 */
export type AppErrorCode =
  | 'CAMERA_PERMISSION_DENIED'
  | 'CAMERA_NOT_SUPPORTED'
  | 'CAMERA_NOT_FOUND'
  | 'CAMERA_IN_USE'
  | 'CAMERA_UNKNOWN'
  | 'MODEL_LOAD_FAILED'
  | 'INFERENCE_FAILED'
  | 'NETWORK_ERROR';

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
      'Camera permission was denied. Allow camera access in your browser settings and try again.',
      options,
    );
  }
}

export class CameraNotSupportedError extends AppError {
  constructor() {
    super(
      'CAMERA_NOT_SUPPORTED',
      'This browser cannot access a camera. Use a recent browser over HTTPS (or localhost).',
    );
  }
}

export class CameraError extends AppError {}

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
    case 'OverconstrainedError':
      return new CameraError('CAMERA_NOT_FOUND', 'No camera was found on this device.', {
        cause: error,
      });
    case 'NotReadableError':
    case 'AbortError':
      return new CameraError(
        'CAMERA_IN_USE',
        'The camera is busy or unavailable. Close other apps using it and try again.',
        { cause: error },
      );
    default:
      return new CameraError('CAMERA_UNKNOWN', 'The camera could not be started.', {
        cause: error,
      });
  }
}
