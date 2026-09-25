import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authRateLimiter, emailRateLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import {
  emailOnlySchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  tokenSchema,
} from '../schemas/auth.schema.js';

export const authRouter = Router();

authRouter.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  authController.register,
);
authRouter.post('/login', authRateLimiter, validate({ body: loginSchema }), authController.login);
// No `authenticate` here: an expired access-token cookie must not block getting a new one.
authRouter.post('/refresh', authController.refresh);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', authenticate, authController.me);

// Email verification and password reset (the links are delivered by email).
authRouter.post(
  '/verify-email/request',
  emailRateLimiter,
  authenticate,
  requireAuth,
  authController.requestEmailVerification,
);
authRouter.post(
  '/verify-email',
  authRateLimiter,
  validate({ body: tokenSchema }),
  authController.verifyEmail,
);
authRouter.post(
  '/password-reset/request',
  emailRateLimiter,
  validate({ body: emailOnlySchema }),
  authController.requestPasswordReset,
);
authRouter.post(
  '/password-reset',
  authRateLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);
