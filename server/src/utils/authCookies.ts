import type { CookieOptions, Request, Response } from 'express';
import { config } from '../config/env.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

/**
 * HttpOnly: JavaScript (and therefore XSS) cannot read the tokens.
 * SameSite=Strict: the browser never sends them on cross-site requests (CSRF defence).
 * Secure: HTTPS only in production.
 * The refresh token is scoped to the auth routes so it is not sent with every API call.
 */
function baseOptions(path: string): CookieOptions {
  return { httpOnly: true, secure: config.auth.cookieSecure, sameSite: 'strict', path };
}

const ACCESS_PATH = '/api';
const REFRESH_PATH = '/api/v1/auth';

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(ACCESS_PATH),
    maxAge: config.auth.accessTokenTtlSeconds * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(REFRESH_PATH),
    maxAge: config.auth.refreshTokenTtlSeconds * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  // Options must match the ones used to set the cookie or the browser keeps it.
  res.clearCookie(ACCESS_COOKIE, baseOptions(ACCESS_PATH));
  res.clearCookie(REFRESH_COOKIE, baseOptions(REFRESH_PATH));
}

function readCookie(req: Request, name: string): string | undefined {
  const cookies: unknown = req.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export const readAccessToken = (req: Request) => readCookie(req, ACCESS_COOKIE);
export const readRefreshToken = (req: Request) => readCookie(req, REFRESH_COOKIE);
