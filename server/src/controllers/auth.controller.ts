import type { Request, Response } from 'express';
import { getValidated } from '../middleware/validate.js';
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from '../schemas/auth.schema.js';
import { authService } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { clearAuthCookies, readRefreshToken, setAuthCookies } from '../utils/authCookies.js';

/** Tokens travel only in HttpOnly cookies; response bodies contain just the public user. */
export const authController = {
  async register(_req: Request, res: Response) {
    const session = await authService.register(getValidated(res, 'body', registerSchema));
    setAuthCookies(res, session);
    sendSuccess(res, { user: session.user }, 201);
  },

  async login(_req: Request, res: Response) {
    const session = await authService.login(getValidated(res, 'body', loginSchema));
    setAuthCookies(res, session);
    sendSuccess(res, { user: session.user });
  },

  async refresh(req: Request, res: Response) {
    const refreshToken = readRefreshToken(req);
    if (!refreshToken) throw AppError.invalidToken();
    try {
      const session = await authService.refresh(refreshToken);
      setAuthCookies(res, session);
      sendSuccess(res, { user: session.user });
    } catch (error) {
      // A dead session: remove the cookies so the client falls back to anonymous mode.
      clearAuthCookies(res);
      throw error;
    }
  },

  async logout(req: Request, res: Response) {
    await authService.logout(readRefreshToken(req));
    clearAuthCookies(res);
    sendSuccess(res, { loggedOut: true });
  },

  /** Returns the signed-in user, or `null` for anonymous visitors (not an error). */
  async me(req: Request, res: Response) {
    const user = req.user ? await authService.getUser(req.user.id) : null;
    sendSuccess(res, { user });
  },

  async requestEmailVerification(req: Request, res: Response) {
    if (!req.user) throw AppError.unauthorized();
    await authService.requestEmailVerification(req.user.id);
    sendSuccess(res, { sent: true });
  },

  async verifyEmail(_req: Request, res: Response) {
    const { token } = getValidated(res, 'body', tokenSchema);
    await authService.verifyEmail(token);
    sendSuccess(res, { verified: true });
  },

  /** Same response whether or not the email is registered (no account enumeration). */
  async requestPasswordReset(_req: Request, res: Response) {
    const { email } = getValidated(res, 'body', emailOnlySchema);
    await authService.requestPasswordReset(email);
    sendSuccess(res, { sent: true });
  },

  async resetPassword(_req: Request, res: Response) {
    const { token, password } = getValidated(res, 'body', resetPasswordSchema);
    const session = await authService.resetPassword(token, password);
    setAuthCookies(res, session);
    sendSuccess(res, { user: session.user });
  },
};
