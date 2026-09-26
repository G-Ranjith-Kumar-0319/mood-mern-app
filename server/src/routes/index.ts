import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { accountRouter } from './account.routes.js';
import { authRouter } from './auth.routes.js';
import { cameraRouter } from './camera.routes.js';
import { expressionRouter } from './expression.routes.js';

/** Everything under /api/v1 (health is mounted separately so probes skip rate limiting). */
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/account', accountRouter);
// Phone camera pairing; the media itself flows browser-to-browser over WebRTC.
apiRouter.use('/camera', cameraRouter);
// Optional auth: signed-in users get private data, anonymous users share the anonymous bucket.
apiRouter.use('/expressions', authenticate, expressionRouter);
