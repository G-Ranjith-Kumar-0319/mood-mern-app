import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

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

const transport = config.mail.smtp ? nodemailer.createTransport(config.mail.smtp) : null;

/** Test-only outbox (mode "memory"). */
export const sentEmails: Email[] = [];

export const mailer = {
  mode,

  async send(email: Email): Promise<void> {
    switch (mode) {
      case 'smtp':
        await transport?.sendMail({ from: config.mail.from, ...email });
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
        return;
    }
  },
};
