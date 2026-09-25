import type { RequestHandler } from 'express';
import { tokenService } from '../services/token.service.js';
import { readAccessToken } from '../utils/authCookies.js';

/**
 * Optional authentication (auth is optional in this app):
 * - no access token      → anonymous request, `req.user` stays undefined
 * - valid access token   → `req.user` is set
 * - invalid/expired token → 401 INVALID_TOKEN, so the client refreshes instead of
 *   silently seeing anonymous data
 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = readAccessToken(req);
  if (!token) return next();

  const { userId } = tokenService.verifyAccessToken(token);
  req.user = { id: userId };
  next();
};
