// Prepares everything docker-compose.prod.yml needs, without overwriting existing values:
//   - .env (JWT secrets) plus MongoDB root/app credentials
//   - secrets/mongo-keyfile  (shared secret for replica-set members)
//   - nginx/certs/*.pem      (self-signed certificate for https://localhost, via openssl)
//   npm run setup:prod
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const random = (bytes) => randomBytes(bytes).toString('base64url'); // URL-safe: no escaping in MONGO_URI

// 1. .env with JWT secrets
execFileSync(process.execPath, [join(root, 'scripts', 'setup-env.mjs')], { stdio: 'inherit' });

// 2. MongoDB credentials (appended only if missing)
const envPath = join(root, '.env');
const env = readFileSync(envPath, 'utf8');
const additions = {
  MONGO_ROOT_USERNAME: 'root',
  MONGO_ROOT_PASSWORD: random(24),
  MONGO_APP_USERNAME: 'expression_api',
  MONGO_APP_PASSWORD: random(24),
  MONGO_APP_DATABASE: 'expression_detector',
  REDIS_PASSWORD: random(24),
  PUBLIC_URL: 'https://localhost',
};
const missing = Object.entries(additions).filter(([key]) => !new RegExp(`^${key}=`, 'm').test(env));
if (missing.length > 0) {
  const lines = missing.map(([key, value]) => `${key}=${value}`).join('\n');
  appendFileSync(envPath, `\n# ----- docker-compose.prod.yml -----\n${lines}\n`);
  console.log(`Added ${missing.map(([key]) => key).join(', ')} to .env`);
}

// 3. Replica-set keyfile: 6–1024 base64 characters, identical on every member.
const keyfilePath = join(root, 'secrets', 'mongo-keyfile');
if (!existsSync(keyfilePath)) {
  mkdirSync(dirname(keyfilePath), { recursive: true });
  writeFileSync(keyfilePath, randomBytes(756).toString('base64'));
  chmodSync(keyfilePath, 0o400);
  console.log('Created secrets/mongo-keyfile');
}

// 4. Self-signed TLS certificate for local HTTPS testing.
const certDir = join(root, 'nginx', 'certs');
const certPath = join(certDir, 'fullchain.pem');
const keyPath = join(certDir, 'privkey.pem');
if (!existsSync(certPath)) {
  mkdirSync(certDir, { recursive: true });
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-days',
        '365',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-subj',
        '/CN=localhost',
        '-addext',
        'subjectAltName=DNS:localhost,IP:127.0.0.1',
      ],
      { stdio: 'ignore', env: { ...process.env, MSYS_NO_PATHCONV: '1' } },
    );
    // Readable by the unprivileged Nginx user. Acceptable for a throw-away
    // self-signed cert; protect real private keys with proper ownership instead.
    chmodSync(keyPath, 0o644);
    console.log('Created a self-signed certificate in nginx/certs/ (valid for localhost).');
  } catch {
    console.warn(
      'openssl not found: put a certificate at nginx/certs/fullchain.pem and its key at nginx/certs/privkey.pem ' +
        '(e.g. generated with mkcert, or from Git Bash: see docs/deployment.md).',
    );
  }
}

console.log('Ready: docker compose -f docker-compose.prod.yml up --build -d');
