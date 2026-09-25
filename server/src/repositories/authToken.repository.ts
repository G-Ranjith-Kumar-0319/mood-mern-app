import type { ClientSession, Types } from 'mongoose';
import { AuthTokenModel, type AuthToken, type AuthTokenType } from '../models/authToken.model.js';

export const authTokenRepository = {
  /** Issues a token and removes older ones of the same type (only the latest link works). */
  async replace(input: {
    userId: Types.ObjectId;
    type: AuthTokenType;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await AuthTokenModel.deleteMany({ userId: input.userId, type: input.type });
    await AuthTokenModel.create(input);
  },

  /** Atomically finds *and deletes* a valid token, so a link can only be used once. */
  consume(tokenHash: string, type: AuthTokenType, now: Date): Promise<AuthToken | null> {
    return AuthTokenModel.findOneAndDelete({ tokenHash, type, expiresAt: { $gt: now } })
      .lean<AuthToken>()
      .exec();
  },

  async deleteForUser(userId: Types.ObjectId, session?: ClientSession) {
    await AuthTokenModel.deleteMany({ userId }, { session });
  },
};
