import type { Types } from 'mongoose';
import { withTransaction } from '../config/database.js';
import { authTokenRepository } from '../repositories/authToken.repository.js';
import { expressionRepository } from '../repositories/expression.repository.js';
import { userRepository } from '../repositories/user.repository.js';
import type { ChangePasswordInput, UpdateSettingsInput } from '../schemas/account.schema.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword, verifyPassword } from '../utils/passwords.js';
import { createSession, toUserDto, type AuthSession, type UserDto } from './auth.service.js';
import { toDetectionDto, type ExpressionDetectionDto } from './expression.service.js';

export const EXPORT_FORMAT = 'expression-detector-export/v1';

async function requirePassword(userId: Types.ObjectId, password: string) {
  const user = await userRepository.findByIdWithPassword(userId);
  if (!user) throw AppError.unauthorized();
  // Same error as a failed login: no hint about which part was wrong.
  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Password is incorrect');
  }
  return user;
}

export const accountService = {
  async updateSettings(userId: Types.ObjectId, settings: UpdateSettingsInput): Promise<UserDto> {
    const user = await userRepository.updateSettings(userId, settings);
    if (!user) throw AppError.unauthorized();
    // Existing detections follow the new policy too (shortening it deletes old data within ~1 min).
    await expressionRepository.applyRetention(userId, settings.retentionDays);
    return toUserDto(user);
  },

  /** Changes the password and signs out every other device (tokenVersion is bumped). */
  async changePassword(userId: Types.ObjectId, input: ChangePasswordInput): Promise<AuthSession> {
    await requirePassword(userId, input.currentPassword);
    const updated = await userRepository.updatePassword(
      userId,
      await hashPassword(input.newPassword),
    );
    if (!updated) throw AppError.unauthorized();
    return createSession(updated);
  },

  /**
   * The user's data as a stream: header fields first, then one detection at a
   * time from a MongoDB cursor, so memory use stays flat however much data exists.
   */
  async *exportData(userId: Types.ObjectId): AsyncGenerator<string> {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.unauthorized();
    const header = {
      format: EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      account: { ...toUserDto(user), createdAt: user.createdAt.toISOString() },
    };
    yield `${JSON.stringify(header).slice(0, -1)},"detections":[`;
    let first = true;
    for await (const document of expressionRepository.streamForOwner(userId)) {
      const dto: ExpressionDetectionDto = toDetectionDto(document);
      yield `${first ? '' : ','}${JSON.stringify(dto)}`;
      first = false;
    }
    yield ']}';
  },

  /** Deletes the account and all its data — atomically where MongoDB supports transactions. */
  async deleteAccount(
    userId: Types.ObjectId,
    password: string,
  ): Promise<{ deletedDetections: number }> {
    await requirePassword(userId, password);
    return withTransaction(async (session) => {
      // Data first, the user last: if a non-transactional run fails midway, the account
      // still exists and the user can simply retry.
      const deletedDetections = await expressionRepository.deleteAllForOwner(userId, session);
      await authTokenRepository.deleteForUser(userId, session);
      await userRepository.deleteById(userId, session);
      return { deletedDetections };
    });
  },
};
