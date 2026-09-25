import type { Request, Response } from 'express';
import { getValidated } from '../middleware/validate.js';
import {
  changePasswordSchema,
  deleteAccountSchema,
  updateSettingsSchema,
} from '../schemas/account.schema.js';
import { accountService } from '../services/account.service.js';
import { authService } from '../services/auth.service.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { clearAuthCookies, setAuthCookies } from '../utils/authCookies.js';

/** Routes are behind `requireAuth`, so `req.user` is always set here. */
const userIdOf = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

export const accountController = {
  async get(req: Request, res: Response) {
    const user = await authService.getUser(userIdOf(req));
    if (!user) throw AppError.unauthorized();
    sendSuccess(res, { user });
  },

  async updateSettings(req: Request, res: Response) {
    const settings = getValidated(res, 'body', updateSettingsSchema);
    sendSuccess(res, { user: await accountService.updateSettings(userIdOf(req), settings) });
  },

  async changePassword(req: Request, res: Response) {
    const input = getValidated(res, 'body', changePasswordSchema);
    const session = await accountService.changePassword(userIdOf(req), input);
    // This device gets fresh cookies; every other session was just revoked.
    setAuthCookies(res, session);
    sendSuccess(res, { user: session.user });
  },

  async exportData(req: Request, res: Response) {
    const userId = userIdOf(req);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="expression-detector-export-${date}.json"`,
    );
    for await (const chunk of accountService.exportData(userId)) {
      // Respect back-pressure: wait when the client reads slower than we write.
      if (!res.write(chunk)) await new Promise((resolve) => res.once('drain', resolve));
    }
    res.end();
  },

  async deleteAccount(req: Request, res: Response) {
    const { password } = getValidated(res, 'body', deleteAccountSchema);
    const result = await accountService.deleteAccount(userIdOf(req), password);
    clearAuthCookies(res);
    sendSuccess(res, { deleted: true, ...result });
  },
};
