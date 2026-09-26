import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../utils/AppError.js';
import { createGmailSender } from './gmailApi.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * How emails are delivered, chosen from configuration:
 * - gmail:    Gmail API over HTTPS (works where SMTP ports are blocked, e.g. Render free tier)
 * - smtp:     real delivery via SMTP (a provider, or Mailpit in Docker Compose)
 * - log:      development without email config — the email (including its link) is logged
 * - memory:   tests — kept in `sentEmails` so tests can read the link
 * - disabled: production without email config — nothing is sent and links are never logged
 */
type Mode = 'gmail' | 'smtp' | 'log' | 'memory' | 'disabled';

function chooseMode(): Mode {
  if (config.mail.gmail) return 'gmail';
  if (config.mail.smtp) return 'smtp';
  if (config.isTest) return 'memory';
  return config.isProduction ? 'disabled' : 'log';
}

const mode = chooseMode();

/**
 * Short timeouts: when a host blocks the SMTP port (e.g. Render's free tier blocks
 * 25/465/587), nodemailer would otherwise wait up to 2 minutes per request.
 */
const SMTP_TIMEOUTS = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
};

interface Transport {
  name: string;
  send: (email: Email) => Promise<unknown>;
  verify: () => Promise<unknown>;
}

function createTransport(): Transport | null {
  if (mode === 'gmail' && config.mail.gmail) {
    const gmail = createGmailSender(config.mail.gmail);
    return {
      name: 'Gmail API',
      send: (email) => gmail.send({ from: config.mail.from, ...email }),
      verify: () => gmail.verify(),
    };
  }
  if (mode === 'smtp' && config.mail.smtp) {
    const smtp = nodemailer.createTransport({ ...config.mail.smtp, ...SMTP_TIMEOUTS });
    return {
      name: `SMTP ${config.mail.smtp.host}:${config.mail.smtp.port}`,
      send: (email) => smtp.sendMail({ from: config.mail.from, ...email }),
      verify: () => smtp.verify(),
    };
  }
  return null;
}

const transport = createTransport();

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
      case 'gmail':
      case 'smtp':
        try {
          await transport?.send(email);
        } catch (error) {
          // The provider's error may include account details: log it, don't return it.
          logger.error(
            { err: error, subject: email.subject, via: transport?.name },
            'Email delivery failed',
          );
          throw emailUnavailable('The email could not be sent right now. Please try again later.');
        }
        return;
      case 'memory':
        sentEmails.push(email);
        return;
      case 'log':
        // Development only: lets you click the link without an email provider.
        logger.info(
          { to: email.to, subject: email.subject, body: email.text },
          'Email (not sent — no email provider configured)',
        );
        return;
      case 'disabled':
        logger.warn({ subject: email.subject }, 'Email not sent: no email provider configured');
        throw emailUnavailable('Sending email is not configured on this server.');
    }
  },

  /** Fails fast (before any lookup) when this server cannot send email at all. */
  assertConfigured(): void {
    if (mode === 'disabled') {
      throw emailUnavailable('Sending email is not configured on this server.');
    }
  },

  /** Startup check: logs whether the provider is reachable and accepts the credentials. */
  async verifyConnection(): Promise<void> {
    if (mode === 'disabled') {
      logger.warn(
        'No email provider configured (GMAIL_* or SMTP_*): verification and password-reset emails are disabled',
      );
      return;
    }
    if (!transport) return;
    try {
      await transport.verify();
      logger.info({ via: transport.name }, 'Email ready');
    } catch (error) {
      logger.error(
        { err: error, via: transport.name },
        'Email provider check failed: emails will not be delivered',
      );
    }
  },
};
