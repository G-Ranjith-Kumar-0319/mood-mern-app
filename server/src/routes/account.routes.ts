import { Router } from 'express';
import { accountController } from '../controllers/account.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authRateLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import {
  changePasswordSchema,
  deleteAccountSchema,
  updateSettingsSchema,
} from '../schemas/account.schema.js';

/** Everything here acts on the signed-in user's own account. */
export const accountRouter = Router();
accountRouter.use(authenticate, requireAuth);

accountRouter.get('/', accountController.get);
accountRouter.patch(
  '/settings',
  validate({ body: updateSettingsSchema }),
  accountController.updateSettings,
);
// Password checks share the brute-force limiter with login.
accountRouter.post(
  '/password',
  authRateLimiter,
  validate({ body: changePasswordSchema }),
  accountController.changePassword,
);
accountRouter.get('/export', accountController.exportData);
accountRouter.delete(
  '/',
  authRateLimiter,
  validate({ body: deleteAccountSchema }),
  accountController.deleteAccount,
);
