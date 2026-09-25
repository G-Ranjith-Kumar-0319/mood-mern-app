import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { config } from '../config/env.js';
import { SERVICE_NAME } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

const ALGORITHM = 'HS256';

export interface AccessTokenClaims {
  userId: Types.ObjectId;
}

export interface RefreshTokenClaims {
  userId: Types.ObjectId;
  tokenVersion: number;
}

function verify(token: string, secret: string, expectedType: 'access' | 'refresh'): jwt.JwtPayload {
  try {
    const payload = jwt.verify(token, secret, { algorithms: [ALGORITHM], issuer: SERVICE_NAME });
    // A refresh token must never be accepted as an access token (and vice versa).
    if (typeof payload === 'string' || payload.type !== expectedType) throw AppError.invalidToken();
    if (!payload.sub || !Types.ObjectId.isValid(payload.sub)) throw AppError.invalidToken();
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw AppError.invalidToken(); // expired, bad signature, malformed...
  }
}

/**
 * Short-lived access tokens are verified without a database lookup (stateless,
 * so any API instance can serve any request). Long-lived refresh tokens carry
 * the user's `tokenVersion`, which is checked against MongoDB on refresh.
 */
export const tokenService = {
  signAccessToken(userId: Types.ObjectId): string {
    return jwt.sign({ type: 'access' }, config.auth.accessSecret, {
      algorithm: ALGORITHM,
      subject: userId.toString(),
      issuer: SERVICE_NAME,
      expiresIn: config.auth.accessTokenTtlSeconds,
    });
  },

  signRefreshToken(userId: Types.ObjectId, tokenVersion: number): string {
    return jwt.sign({ type: 'refresh', ver: tokenVersion }, config.auth.refreshSecret, {
      algorithm: ALGORITHM,
      subject: userId.toString(),
      issuer: SERVICE_NAME,
      expiresIn: config.auth.refreshTokenTtlSeconds,
    });
  },

  verifyAccessToken(token: string): AccessTokenClaims {
    const payload = verify(token, config.auth.accessSecret, 'access');
    return { userId: new Types.ObjectId(payload.sub) };
  },

  verifyRefreshToken(token: string): RefreshTokenClaims {
    const payload = verify(token, config.auth.refreshSecret, 'refresh');
    if (typeof payload.ver !== 'number') throw AppError.invalidToken();
    return { userId: new Types.ObjectId(payload.sub), tokenVersion: payload.ver };
  },
};
