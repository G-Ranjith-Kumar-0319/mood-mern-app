import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';

/** For endpoints that only make sense for a signed-in user (run after `authenticate`). */
export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.user ? undefined : AppError.unauthorized());
};
