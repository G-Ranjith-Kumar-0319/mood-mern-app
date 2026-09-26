import MailComposer from 'nodemailer/lib/mail-composer/index.js';

/**
 * Sends email through the Gmail API over HTTPS (port 443) instead of SMTP.
 * Hosts such as Render's free tier block outbound SMTP ports (25/465/587), but
 * not HTTPS. Authentication is OAuth 2.0: a long-lived refresh token (created once
 * with `npm run gmail:token`) is exchanged for short-lived access tokens.
 *
 * No Google SDK: two fetch calls, and Nodemailer's own MIME builder for the message.
 */

export interface GmailCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const REQUEST_TIMEOUT_MS = 10_000;
/** Refresh a little before Google's expiry so a token never dies mid-request. */
const EXPIRY_MARGIN_MS = 60_000;

export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

/** Google errors: OAuth uses { error, error_description }, the Gmail API { error: { message } }. */
interface GoogleErrorBody {
  error?: string | { message?: string };
  error_description?: string;
}

async function describeFailure(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as GoogleErrorBody;
  const detail =
    typeof body.error === 'object' ? body.error.message : (body.error_description ?? body.error);
  return `${response.status} ${detail ?? response.statusText}`;
}

export function createGmailSender(credentials: GmailCredentials, fetchImpl: typeof fetch = fetch) {
  let cached: { token: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cached && Date.now() < cached.expiresAt) return cached.token;
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // e.g. "400 invalid_grant": the refresh token was revoked or expired.
      throw new GmailApiError(
        `Gmail token refresh failed: ${await describeFailure(response)}`,
        response.status,
      );
    }
    const body = (await response.json()) as TokenResponse;
    if (!body.access_token)
      throw new GmailApiError('Gmail token response had no access token', 502);
    cached = {
      token: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 - EXPIRY_MARGIN_MS,
    };
    return cached.token;
  }

  async function send(message: GmailMessage): Promise<void> {
    const mime = await new MailComposer(message).compile().build();
    const response = await fetchImpl(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: mime.toString('base64url') }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      if (response.status === 401) cached = null; // force a fresh token next time
      throw new GmailApiError(
        `Gmail send failed: ${await describeFailure(response)}`,
        response.status,
      );
    }
  }

  /** Proves the credentials work (used at startup) without sending anything. */
  async function verify(): Promise<void> {
    await accessToken();
  }

  return { send, verify };
}
