import { config } from '../config/env.js';
import type { Email } from './mailer.js';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function layout(
  to: string,
  subject: string,
  intro: string,
  action: string,
  url: string,
  expiry: string,
): Email {
  const text = `${intro}\n\n${action}: ${url}\n\n${expiry}\nIf you did not request this, you can ignore this email.`;
  const html = `<p>${escapeHtml(intro)}</p>
<p><a href="${escapeHtml(url)}">${escapeHtml(action)}</a></p>
<p style="color:#666">${escapeHtml(expiry)} If you did not request this, you can ignore this email.</p>`;
  return { to, subject, text, html };
}

export function verificationEmail(to: string, token: string): Email {
  return layout(
    to,
    'Verify your email address',
    'Please confirm the email address for your Expression Detector account.',
    'Verify email',
    `${config.appUrl}/verify-email?token=${encodeURIComponent(token)}`,
    'This link expires in 24 hours.',
  );
}

export function passwordResetEmail(to: string, token: string): Email {
  return layout(
    to,
    'Reset your password',
    'Someone (hopefully you) asked to reset the password for your Expression Detector account.',
    'Choose a new password',
    `${config.appUrl}/reset-password?token=${encodeURIComponent(token)}`,
    'This link expires in 1 hour and can be used once.',
  );
}
