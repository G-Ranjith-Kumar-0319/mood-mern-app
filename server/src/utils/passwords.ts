import bcrypt from 'bcryptjs';

/** ~250 ms per hash on a modern CPU: slow for attackers, acceptable for a login. */
const BCRYPT_COST = 12;

/**
 * Compared against when there is no stored hash (unknown email), so "unknown
 * email" and "wrong password" take the same time and cannot be told apart.
 */
const DUMMY_HASH = bcrypt.hashSync('timing-equalisation-only', BCRYPT_COST);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Constant-time-ish comparison; pass `undefined` for a missing user to keep timing equal. */
export function verifyPassword(password: string, hash: string | undefined): Promise<boolean> {
  return bcrypt
    .compare(password, hash ?? DUMMY_HASH)
    .then((matches) => matches && hash !== undefined);
}
