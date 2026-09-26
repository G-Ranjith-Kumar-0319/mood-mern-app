import { Router } from 'express';
import { cameraController } from '../controllers/camera.controller.js';
import { cameraSessionRateLimiter } from '../middleware/rateLimit.js';

export const cameraRouter = Router();

// No request body: the server chooses the session id and tokens.
cameraRouter.post('/sessions', cameraSessionRateLimiter, cameraController.createSession);
