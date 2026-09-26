#!/usr/bin/env node
/**
 * One-time helper: authorise this app to send email from YOUR Gmail account via the
 * Gmail API, and print the refresh token to put in GMAIL_REFRESH_TOKEN.
 *
 *   npm run gmail:token
 *
 * Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET (a Google Cloud OAuth client of type
 * "Desktop app") in the root .env or the environment. See docs/deployment.md → Email.
 *
 * Standard OAuth "installed app" flow: a temporary server on 127.0.0.1 receives
 * Google's redirect (loopback), protected with PKCE and a random state value.
 * Only the gmail.send scope is requested: the app can send mail, not read it.
 * No dependencies; nothing is written to disk.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(
    'Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in the root .env first\n' +
      '(Google Cloud → APIs & Services → Credentials → OAuth client ID → Desktop app).',
  );
  process.exit(1);
}

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const TIMEOUT_MS = 5 * 60 * 1000;
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('hex');

const server = createServer();
server.listen(0, '127.0.0.1', () => {
  const redirectUri = `http://127.0.0.1:${server.address().port}`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    // offline + consent: Google returns a refresh token every time.
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  }).toString();

  console.log(
    '\nOpen this URL in your browser and sign in with the Gmail account that will send the emails:\n',
  );
  console.log(authUrl.toString());
  console.log(
    '\n(If Google says "Google hasn\'t verified this app", click Advanced → Go to … (unsafe):',
  );
  console.log(' it is your own app asking to send mail as you.)\n');

  server.on('request', async (req, res) => {
    const params = new URL(req.url ?? '/', redirectUri).searchParams;
    if (!params.has('code') && !params.has('error')) {
      res.writeHead(404).end();
      return;
    }
    const finish = (message, exitCode) => {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
      server.close();
      process.exitCode = exitCode;
    };
    if (params.get('state') !== state)
      return finish('State mismatch; please run the command again.', 1);
    if (params.has('error')) return finish(`Google returned: ${params.get('error')}`, 1);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: params.get('code'),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    const body = await response.json();
    if (!response.ok || !body.refresh_token) {
      console.error(
        '\nToken exchange failed:',
        body.error_description ?? body.error ?? response.status,
      );
      return finish('Failed; see the terminal.', 1);
    }

    console.log('Success. Add these to Render → Environment (and your local .env if you like):\n');
    console.log(`GMAIL_REFRESH_TOKEN=${body.refresh_token}`);
    console.log('MAIL_FROM=Mood Detector <the-gmail-address-you-just-used@gmail.com>\n');
    console.log('Keep the refresh token secret: it allows sending email as you.');
    console.log('If your OAuth app is still in "Testing", the token stops working after 7 days;');
    console.log('publish it ("In production") in the OAuth consent screen to keep it working.\n');
    finish('Done. You can close this tab and return to the terminal.', 0);
  });

  setTimeout(() => {
    console.error('Timed out waiting for the browser. Run the command again.');
    server.close();
    process.exitCode = 1;
  }, TIMEOUT_MS).unref();
});
