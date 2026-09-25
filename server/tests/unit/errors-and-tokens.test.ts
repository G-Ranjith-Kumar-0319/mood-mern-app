import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { toAppError } from '../../src/middleware/errorHandler.js';
import { tokenService } from '../../src/services/token.service.js';
import { AppError } from '../../src/utils/AppError.js';

describe('toAppError', () => {
  it('passes AppErrors through unchanged', () => {
    const error = AppError.notFound();
    expect(toAppError(error)).toBe(error);
  });

  it('maps body-parser errors', () => {
    expect(toAppError({ type: 'entity.parse.failed' }).code).toBe('INVALID_JSON');
    expect(toAppError({ type: 'entity.too.large' }).statusCode).toBe(413);
  });

  it('maps Mongoose cast errors to validation errors', () => {
    const castError = new mongoose.Error.CastError('ObjectId', 'bad', '_id');
    expect(toAppError(castError).code).toBe('VALIDATION_ERROR');
  });

  it('never leaks unknown error details', () => {
    const appError = toAppError(new Error('connection string mongodb://secret@host'));
    expect(appError.statusCode).toBe(500);
    expect(appError.message).toBe('Something went wrong');
  });
});

describe('tokenService', () => {
  const userId = new mongoose.Types.ObjectId();

  it('round-trips access and refresh tokens', () => {
    expect(tokenService.verifyAccessToken(tokenService.signAccessToken(userId)).userId).toEqual(
      userId,
    );
    const refresh = tokenService.verifyRefreshToken(tokenService.signRefreshToken(userId, 3));
    expect(refresh).toEqual({ userId, tokenVersion: 3 });
  });

  it('refuses to use one token type as the other', () => {
    expect(() => tokenService.verifyAccessToken(tokenService.signRefreshToken(userId, 0))).toThrow(
      AppError,
    );
    expect(() => tokenService.verifyRefreshToken(tokenService.signAccessToken(userId))).toThrow(
      AppError,
    );
  });

  it('rejects tokens signed with another secret or algorithm', () => {
    const forged = jwt.sign({ type: 'access' }, 'attacker-secret', { subject: userId.toString() });
    expect(() => tokenService.verifyAccessToken(forged)).toThrow(AppError);

    const unsigned = jwt.sign({ type: 'access', sub: userId.toString() }, '', {
      algorithm: 'none',
    });
    expect(() => tokenService.verifyAccessToken(unsigned)).toThrow(AppError);
  });

  it('rejects expired tokens', () => {
    const expired = jwt.sign(
      { type: 'access', exp: Math.floor(Date.now() / 1000) - 10 },
      process.env.JWT_ACCESS_SECRET ?? '',
      { subject: userId.toString(), issuer: 'expression-api' },
    );
    expect(() => tokenService.verifyAccessToken(expired)).toThrow(AppError);
  });
});
