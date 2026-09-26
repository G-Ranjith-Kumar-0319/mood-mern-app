export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNAUTHORIZED'
  | 'INVALID_TOKEN'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'INVALID_LINK'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'DATABASE_UNAVAILABLE'
  | 'EMAIL_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ErrorDetail {
  path: string;
  message: string;
}

/**
 * An expected, client-safe error. Its message is returned to the client, so it
 * must never contain internals. Anything that is *not* an AppError is treated
 * as a bug and becomes a generic 500 response.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: ErrorDetail[];

  constructor(statusCode: number, code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static validation(message: string, details?: ErrorDetail[]) {
    return new AppError(400, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static invalidToken(message = 'Session is invalid or has expired') {
    return new AppError(401, 'INVALID_TOKEN', message);
  }

  static forbidden(message = 'You do not have access to this resource') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static conflict(message: string) {
    return new AppError(409, 'CONFLICT', message);
  }

  static rateLimited(message = 'Too many requests, please try again later') {
    return new AppError(429, 'RATE_LIMITED', message);
  }
}
