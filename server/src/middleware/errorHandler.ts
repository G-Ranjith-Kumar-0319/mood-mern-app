import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../utils/AppError.js';

interface BodyParserError {
  type: string;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  return (
    typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string'
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return error instanceof mongoose.mongo.MongoServerError && error.code === 11000;
}

function isDatabaseUnavailable(error: unknown): boolean {
  return (
    error instanceof mongoose.mongo.MongoServerSelectionError ||
    error instanceof mongoose.mongo.MongoNetworkError ||
    error instanceof mongoose.mongo.MongoNotConnectedError
  );
}

/** Translates known library errors into client-safe AppErrors. Everything else is a 500. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (isBodyParserError(error)) {
    if (error.type === 'entity.parse.failed') {
      return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    }
    if (error.type === 'entity.too.large') {
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
  }
  if (error instanceof mongoose.Error.CastError) {
    return AppError.validation(`Invalid value for ${error.path}`);
  }
  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.values(error.errors).map((e) => ({ path: e.path, message: e.message }));
    return AppError.validation('Invalid data', details);
  }
  if (isDuplicateKeyError(error)) {
    return AppError.conflict('Resource already exists');
  }
  if (isDatabaseUnavailable(error)) {
    return new AppError(503, 'DATABASE_UNAVAILABLE', 'Service temporarily unavailable');
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Something went wrong');
}

/**
 * The single place errors become HTTP responses. Stack traces are logged
 * (with the request id) but never sent to the client.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);

  const appError = toAppError(error);
  if (appError.statusCode >= 500) {
    req.log.error({ err: error }, 'Request failed');
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details && { details: appError.details }),
    },
  });
};

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route ${req.method} ${req.path} not found`));
};
