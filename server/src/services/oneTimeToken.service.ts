import { createHash, randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import type { AuthTokenType } from '../models/authToken.model.js';
import { authTokenRepository } from '../repositories/authToken.repository.js';
import { AppError } from '../utils/AppError.js';

const HOUR_MS = 60 * 60 * 1000;
const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  'verify-email': 24 * HOUR_MS,
  'reset-password': HOUR_MS,
};
const TOKEN_BYTES = 32;

/** Only this hash is stored; the raw token exists only in the emailed link. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const oneTimeTokenService = {
  /** Creates a new single-use token (invalidating older ones) and returns the raw value. */
  async issue(userId: Types.ObjectId, type: AuthTokenType): Promise<string> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    await authTokenRepository.replace({
      userId,
      type,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS[type]),
    });
    return token;
  },

  /** Returns the token's user and deletes the token; throws for unknown, used or expired links. */
  async consume(token: string, type: AuthTokenType): Promise<Types.ObjectId> {
    const record = await authTokenRepository.consume(hashToken(token), type, new Date());
    if (!record) throw new AppError(400, 'INVALID_LINK', 'This link is invalid or has expired');
    return record.userId;
  },
};
