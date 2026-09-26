import type { Request, Response } from 'express';
import { config } from '../config/env.js';
import { cameraSessionService } from '../services/cameraSession.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { findLanAddress, resolveCameraBaseUrl } from '../utils/phoneCameraUrl.js';

export const cameraController = {
  /** POST /api/v1/camera/sessions — a short-lived pairing session for a phone camera. */
  createSession(req: Request, res: Response) {
    const baseUrl = resolveCameraBaseUrl({
      configured: config.camera.publicUrl,
      appUrl: config.appUrl,
      isProduction: config.isProduction,
      requestOrigin: req.get('origin'),
      lanAddress: findLanAddress(),
    });
    sendSuccess(res, cameraSessionService.create(baseUrl), 201);
  },
};
