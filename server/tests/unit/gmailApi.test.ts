import { describe, expect, it, vi } from 'vitest';
import { createGmailSender, GmailApiError } from '../../src/services/gmailApi.js';

const CREDENTIALS = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  refreshToken: 'refresh',
};
const MESSAGE = {
  from: 'Mood Detector <me@gmail.com>',
  to: 'user@example.com',
  subject: 'Verify your email',
  text: 'Open https://app.example.com/verify-email?token=abc',
  html: '<p>Open the link</p>',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fakeGoogle(sendStatus = 200) {
  return vi.fn((input: string | URL | Request, _init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return Promise.resolve(json(200, { access_token: 'access-1', expires_in: 3600 }));
    }
    return Promise.resolve(
      sendStatus === 200
        ? json(200, { id: 'msg-1' })
        : json(sendStatus, { error: { message: 'Insufficient Permission' } }),
    );
  });
}

describe('Gmail API sender', () => {
  it('exchanges the refresh token, then sends the MIME message as base64url', async () => {
    const fetchMock = fakeGoogle();
    await createGmailSender(CREDENTIALS, fetchMock).send(MESSAGE);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(String(tokenInit.body));
    expect(form.get('grant_type')).toBe('refresh_token');
    expect(form.get('refresh_token')).toBe('refresh');

    const [sendUrl, sendInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(sendUrl).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(new Headers(sendInit.headers).get('authorization')).toBe('Bearer access-1');
    const raw = (JSON.parse(String(sendInit.body)) as { raw: string }).raw;
    const mime = Buffer.from(raw, 'base64url').toString('utf8');
    expect(mime).toContain('To: user@example.com');
    expect(mime).toContain('Subject: Verify your email');
    expect(mime).toContain('multipart/alternative');
  });

  it('reuses the access token until it expires', async () => {
    const fetchMock = fakeGoogle();
    const gmail = createGmailSender(CREDENTIALS, fetchMock);
    await gmail.send(MESSAGE);
    await gmail.send(MESSAGE);

    const tokenCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('oauth2'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('reports a revoked refresh token clearly', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        json(400, {
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        }),
      ),
    );
    const error = await createGmailSender(CREDENTIALS, fetchMock)
      .verify()
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GmailApiError);
    expect((error as Error).message).toMatch(/400 Token has been expired or revoked/);
  });

  it('reports a failed send with Google’s reason', async () => {
    const error = await createGmailSender(CREDENTIALS, fakeGoogle(403))
      .send(MESSAGE)
      .catch((caught: unknown) => caught);
    expect((error as Error).message).toMatch(/403 Insufficient Permission/);
  });
});
