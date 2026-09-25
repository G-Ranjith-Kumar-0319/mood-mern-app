import { z } from 'zod';

/** bcrypt only uses the first 72 *bytes* of a password; reject longer ones instead of silently truncating. */
const BCRYPT_MAX_BYTES = 72;
const MIN_PASSWORD_LENGTH = 8;

const email = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());

export const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .refine((value) => new TextEncoder().encode(value).length <= BCRYPT_MAX_BYTES, {
    message: `Password must be at most ${BCRYPT_MAX_BYTES} bytes`,
  });

export const registerSchema = z.strictObject({
  email,
  password: newPassword,
  displayName: z.string().trim().min(1).max(60).optional(),
});

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1).max(256),
});

export const emailOnlySchema = z.strictObject({ email });

/** Raw tokens from emailed links: 32 random bytes, base64url-encoded (43 chars). */
const linkToken = z.string().regex(/^[\w-]{20,100}$/, 'Invalid link');

export const tokenSchema = z.strictObject({ token: linkToken });

export const resetPasswordSchema = z.strictObject({ token: linkToken, password: newPassword });

export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;
