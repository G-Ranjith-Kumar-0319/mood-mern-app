import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * How emails are delivered, chosen from configuration:
 * - smtp:     real delivery (production, or Mailpit in Docker Compose)
 * - log:      development without SMTP — the email (including its link) is logged
 * - memory:   tests — kept in `sentEmails` so tests can read the link
 * - disabled: production without SMTP — nothing is sent and links are never logged
 */
type Mode = 'smtp' | 'log' | 'memory' | 'disabled';

const mode: Mode = config.mail.smtp
  ? 'smtp'
  : config.isTest
    ? 'memory'
    : config.isProduction
      ? 'disabled'
      : 'log';

/**
 * Short timeouts: when a host blocks the SMTP port (e.g. Render's free tier blocks
 * 25/465/587), nodemailer would otherwise wait up to 2 minutes per request.
 */
const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
};

const transport = config.mail.smtp
  ? nodemailer.createTransport({ ...config.mail.smtp, ...SMTP_TIMEOUTS })
  : null;

const emailUnavailable = (message: string) => new AppError(503, 'EMAIL_UNAVAILABLE', message);

/** Test-only outbox (mode "memory"). */
export const sentEmails: Email[] = [];

export const mailer = {
  mode,

  /**
   * Throws a client-safe 503 when the email cannot be sent, so the user sees
   * "email is unavailable" instead of a false "email sent".
   */
  async send(email: Email): Promise<void> {
    switch (mode) {
      case 'smtp':
        try {
          await transport?.sendMail({ from: config.mail.from, ...email });
        } catch (error) {
          // The provider's error may include account details: log it, don't return it.
          logger.error({ err: error, subject: email.subject }, 'SMTP delivery failed');
          throw emailUnavailable('The email could not be sent right now. Please try again later.');
        }
        return;
      case 'memory':
        sentEmails.push(email);
        return;
      case 'log':
        // Development only: lets you click the link without an SMTP server.
        logger.info(
          { to: email.to, subject: email.subject, body: email.text },
          'Email (not sent — no SMTP configured)',
        );
        return;
      case 'disabled':
        logger.warn({ subject: email.subject }, 'Email not sent: SMTP is not configured');
        throw emailUnavailable('Sending email is not configured on this server.');
    }
  },

  /** Fails fast (before any lookup) when this server cannot send email at all. */
  assertConfigured(): void {
    if (mode === 'disabled') {
      throw emailUnavailable('Sending email is not configured on this server.');
    }
  },

  /** Startup check: logs whether SMTP is reachable and accepts the credentials. */
  async verifyConnection(): Promise<void> {
    if (mode === 'disabled') {
      logger.warn('SMTP_HOST is not set: verification and password-reset emails are disabled');
      return;
    }
    if (!transport) return;
    try {
      await transport.verify();
      logger.info({ host: config.mail.smtp?.host, port: config.mail.smtp?.port }, 'SMTP ready');
    } catch (error) {
      logger.error(
        { err: error, host: config.mail.smtp?.host, port: config.mail.smtp?.port },
        'SMTP connection failed: emails will not be delivered',
      );
    }
  },
};
