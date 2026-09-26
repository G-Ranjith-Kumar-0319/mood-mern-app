import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '../../src/utils/AppError.js';

const EMAIL = { to: 'user@example.com', subject: 'Verify', text: 'link', html: '<p>link</p>' };
const SMTP = { host: 'smtp-relay.example.com', port: 2525, secure: false };

/** The mailer picks its mode at import time, so each case loads it with its own config. */
async function loadMailer(smtp: typeof SMTP | null, sendMail = vi.fn()) {
  vi.resetModules();
  const createTransport = vi.fn(() => ({ sendMail, verify: vi.fn() }));
  vi.doMock('nodemailer', () => ({ default: { createTransport } }));
  vi.doMock('../../src/config/env.js', () => ({
    config: {
      isTest: false,
      isProduction: true,
      mail: { from: 'App <no-reply@example.com>', smtp },
    },
  }));
  vi.doMock('../../src/config/logger.js', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }));
  const { mailer } = await import('../../src/services/mailer.js');
  return { mailer, createTransport, sendMail };
}

async function rejectionOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    return error as AppError;
  }
  throw new Error('expected a rejection');
}

describe('mailer in production', () => {
  afterEach(() => {
    vi.doUnmock('nodemailer');
    vi.doUnmock('../../src/config/env.js');
    vi.doUnmock('../../src/config/logger.js');
  });

  it('reports "not configured" instead of pretending the email was sent', async () => {
    const { mailer } = await loadMailer(null);

    expect(mailer.mode).toBe('disabled');
    const error = await rejectionOf(mailer.send(EMAIL));
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('EMAIL_UNAVAILABLE');
    expect(() => mailer.assertConfigured()).toThrow(/not configured/);
  });

  it('uses short SMTP timeouts, so a blocked port cannot hang requests for minutes', async () => {
    const { createTransport } = await loadMailer(SMTP);
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: SMTP.host, port: 2525, connectionTimeout: 10_000 }),
    );
  });

  it('turns an SMTP failure into a client-safe 503 without leaking provider details', async () => {
    const sendMail = vi.fn().mockRejectedValue(new Error('535 Authentication failed for key xyz'));
    const { mailer } = await loadMailer(SMTP, sendMail);

    const error = await rejectionOf(mailer.send(EMAIL));
    expect(error.code).toBe('EMAIL_UNAVAILABLE');
    expect(error.message).not.toContain('535');
  });

  it('sends through SMTP with the configured sender', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const { mailer } = await loadMailer(SMTP, sendMail);

    await mailer.send(EMAIL);
    expect(sendMail).toHaveBeenCalledWith({ from: 'App <no-reply@example.com>', ...EMAIL });
  });
});
