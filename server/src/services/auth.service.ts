import mongoose from 'mongoose';
import { logger } from '../config/logger.js';
import type { User } from '../models/user.model.js';
import { userRepository } from '../repositories/user.repository.js';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js';
import { AppError } from '../utils/AppError.js';
import { hashPassword, verifyPassword } from '../utils/passwords.js';
import { passwordResetEmail, verificationEmail } from './emailTemplates.js';
import { mailer } from './mailer.js';
import { oneTimeTokenService } from './oneTimeToken.service.js';
import { tokenService } from './token.service.js';

export interface UserDto {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  /** Detections are deleted automatically after this many days (null = kept). */
  retentionDays: number | null;
}

export interface AuthSession {
  user: UserDto;
  accessToken: string;
  refreshToken: string;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName ?? null,
    emailVerified: user.emailVerified ?? false,
    retentionDays: user.retentionDays ?? null,
  };
}

export function createSession(user: User): AuthSession {
  return {
    user: toUserDto(user),
    accessToken: tokenService.signAccessToken(user._id),
    refreshToken: tokenService.signRefreshToken(user._id, user.tokenVersion),
  };
}

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

async function sendVerificationEmail(user: User): Promise<void> {
  const token = await oneTimeTokenService.issue(user._id, 'verify-email');
  await mailer.send(verificationEmail(user.email, token));
}

export const authService = {
  async register(input: RegisterInput): Promise<AuthSession> {
    const passwordHash = await hashPassword(input.password);
    let user: User;
    try {
      user = await userRepository.create({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
      });
    } catch (error) {
      // The unique index is the real guard against duplicates (no check-then-insert race).
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
        throw AppError.conflict('An account with this email already exists');
      }
      throw error;
    }
    // A mail outage must not block sign-up; the user can re-send from the account page.
    await sendVerificationEmail(user).catch((error: unknown) =>
      logger.error({ err: error }, 'Could not send verification email'),
    );
    return createSession(user);
  },

  async login(input: LoginInput): Promise<AuthSession> {
    const user = await userRepository.findByEmailWithPassword(input.email);
    const passwordMatches = await verifyPassword(input.password, user?.passwordHash);
    if (!user || !passwordMatches) throw invalidCredentials();
    return createSession(user);
  },

  /** Issues a fresh token pair if the refresh token is valid and not revoked. */
  async refresh(refreshToken: string): Promise<AuthSession> {
    const claims = tokenService.verifyRefreshToken(refreshToken);
    const user = await userRepository.findById(claims.userId);
    if (!user || user.tokenVersion !== claims.tokenVersion) throw AppError.invalidToken();
    return createSession(user);
  },

  /** Revokes every refresh token of the user (sign out on all devices). */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      const claims = tokenService.verifyRefreshToken(refreshToken);
      await userRepository.incrementTokenVersion(claims.userId);
    } catch (error) {
      // An invalid/expired token has nothing left to revoke; logging out must still succeed.
      if (!(error instanceof AppError)) throw error;
    }
  },

  async getUser(userId: mongoose.Types.ObjectId): Promise<UserDto | null> {
    const user = await userRepository.findById(userId);
    return user ? toUserDto(user) : null;
  },

  async requestEmailVerification(userId: mongoose.Types.ObjectId): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.unauthorized();
    if (user.emailVerified) return;
    await sendVerificationEmail(user);
  },

  async verifyEmail(token: string): Promise<void> {
    const userId = await oneTimeTokenService.consume(token, 'verify-email');
    await userRepository.markEmailVerified(userId);
  },

  /**
   * Always succeeds from the caller's point of view, whether or not the email
   * exists, so the endpoint cannot be used to discover registered addresses.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user) return;
    const token = await oneTimeTokenService.issue(user._id, 'reset-password');
    await mailer.send(passwordResetEmail(user.email, token));
  },

  /** Sets a new password, signs out every existing session and returns a fresh one. */
  async resetPassword(token: string, newPassword: string): Promise<AuthSession> {
    const userId = await oneTimeTokenService.consume(token, 'reset-password');
    const user = await userRepository.updatePassword(userId, await hashPassword(newPassword));
    if (!user) throw new AppError(400, 'INVALID_LINK', 'This link is invalid or has expired');
    // Receiving the email proves the user controls this address.
    await userRepository.markEmailVerified(userId);
    return createSession({ ...user, emailVerified: true });
  },
};
