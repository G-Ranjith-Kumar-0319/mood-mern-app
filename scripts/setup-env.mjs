// Creates `.env` from `.env.example`, replacing the placeholder JWT secrets with
// strong random values. Never overwrites an existing `.env`.
//   npm run setup:env
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.env');
const example = join(root, '.env.example');

if (existsSync(target)) {
  console.log('.env already exists — leaving it unchanged.');
  process.exit(0);
}

copyFileSync(example, target);
const secret = () => randomBytes(48).toString('base64url');
const content = readFileSync(target, 'utf8')
  .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${secret()}`)
  .replace(/^JWT_REFRESH_SECRET=.*$/m, `JWT_REFRESH_SECRET=${secret()}`);
writeFileSync(target, content);
console.log('Created .env with freshly generated JWT secrets.');
