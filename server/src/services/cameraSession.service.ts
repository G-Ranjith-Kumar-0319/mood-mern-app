import { createHmac, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { buildIceServers, type IceServer } from '../config/rtc.js';
import { buildCameraUrl } from '../utils/phoneCameraUrl.js';

/** "host" = the laptop running detection; "phone" = the remote camera. */
export type CameraRole = 'host' | 'phone';

export interface CameraSessionDto {
  sessionId: string;
  /** Kept by the laptop; lets it (re)join as host. Never put in the QR code. */
  hostToken: string;
  /** Encoded in the QR code; only allows joining as the phone. */
  phoneToken: string;
  cameraUrl: string;
  expiresAt: string;
  iceServers: IceServer[];
}

export interface CameraTokenClaims {
  sessionId: string;
  role: CameraRole;
  expiresAt: number;
}

export type CameraSessionErrorCode = 'SESSION_EXPIRED' | 'SESSION_INVALID';

export class CameraSessionError extends Error {
  constructor(readonly code: CameraSessionErrorCode) {
    super(
      code === 'SESSION_EXPIRED'
        ? 'Camera session expired. Please generate a new QR code.'
        : 'This camera link is not valid.',
    );
    this.name = 'CameraSessionError';
  }
}

const ALGORITHM = 'HS256';
const AUDIENCE = 'camera-session';
const SESSION_ID_BYTES = 9; // → 12 URL-safe characters
const MS_PER_SECOND = 1000;

// A key derived for this purpose only, so a camera token can never be confused with a login token.
const signingKey = createHmac('sha256', config.auth.accessSecret)
  .update('camera-session-token')
  .digest();

function signToken(sessionId: string, role: CameraRole, ttlSeconds: number): string {
  return jwt.sign({ role }, signingKey, {
    algorithm: ALGORITHM,
    audience: AUDIENCE,
    subject: sessionId,
    expiresIn: ttlSeconds,
  });
}

/**
 * Camera sessions are *signed tokens*, not database rows: any API instance can
 * verify them, so no shared store is needed when several instances run behind
 * Nginx. Live presence (who is connected) is kept in memory by the signaling
 * server that both peers are routed to.
 */
export const cameraSessionService = {
  create(baseUrl: string, now = Date.now()): CameraSessionDto {
    const sessionId = randomBytes(SESSION_ID_BYTES).toString('base64url');
    const ttlSeconds = config.camera.sessionTtlSeconds;
    const phoneToken = signToken(sessionId, 'phone', ttlSeconds);
    return {
      sessionId,
      hostToken: signToken(sessionId, 'host', ttlSeconds),
      phoneToken,
      cameraUrl: buildCameraUrl(baseUrl, sessionId, phoneToken),
      expiresAt: new Date(now + ttlSeconds * MS_PER_SECOND).toISOString(),
      iceServers: buildIceServers(),
    };
  },

  /** Checks signature, expiry and that the token belongs to `sessionId`. */
  verify(token: string, sessionId: string): CameraTokenClaims {
    let payload: string | jwt.JwtPayload;
    try {
      payload = jwt.verify(token, signingKey, {
        algorithms: [ALGORITHM],
        audience: AUDIENCE,
        subject: sessionId,
      });
    } catch (error) {
      throw new CameraSessionError(
        error instanceof jwt.TokenExpiredError ? 'SESSION_EXPIRED' : 'SESSION_INVALID',
      );
    }
    if (typeof payload === 'string' || (payload.role !== 'host' && payload.role !== 'phone')) {
      throw new CameraSessionError('SESSION_INVALID');
    }
    return {
      sessionId,
      role: payload.role as CameraRole,
      expiresAt: (payload.exp ?? 0) * MS_PER_SECOND,
    };
  },

  iceServers: (): IceServer[] => buildIceServers(),
};
