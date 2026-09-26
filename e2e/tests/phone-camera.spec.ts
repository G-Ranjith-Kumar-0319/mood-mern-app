import { expect, test } from '@playwright/test';
import { expressionTitle } from './helpers';

/**
 * Real WebRTC in Chromium: a second page plays the "phone" (its fake camera shows a
 * photo of faces) and streams to the laptop page, which runs the normal detector on
 * the received video. Signaling goes through the real API (Socket.IO).
 */
test('a phone page streams its camera to the laptop over WebRTC', async ({ context }) => {
  const laptop = await context.newPage();
  await laptop.goto('/');
  await laptop.getByRole('button', { name: 'Phone camera' }).click();
  await expect(laptop.getByRole('img', { name: /QR code/ })).toBeVisible();

  // The QR link points at this machine's LAN address; open the same path + #token here.
  const href = await laptop.getByTestId('phone-camera-link').getAttribute('href');
  const phoneUrl = new URL(href ?? '');
  expect(phoneUrl.pathname).toMatch(/^\/camera\/[\w-]+$/);
  expect(phoneUrl.hash).toMatch(/^#token=/);
  expect(phoneUrl.search).toBe(''); // the token never goes in the query string

  const phone = await context.newPage();
  await phone.goto(`${phoneUrl.pathname}${phoneUrl.hash}`);
  await expect(phone.getByText('Connected to laptop')).toBeVisible();
  await expect(laptop.getByText('Phone connected', { exact: true })).toBeVisible();

  await phone.getByRole('button', { name: 'Start camera' }).click();
  await expect(phone.getByText('Streaming to laptop')).toBeVisible({ timeout: 30_000 });

  // The laptop's existing detector analyses the remote stream.
  await expect(laptop.getByText('Connected', { exact: true })).toBeVisible();
  await expect(laptop.getByTestId('face-box').first()).toBeVisible({ timeout: 60_000 });
  await expect(expressionTitle(laptop)).not.toHaveText(/Detecting|Loading|Waiting/, {
    timeout: 60_000,
  });

  // Stopping on the phone returns the laptop to "phone connected, not streaming".
  await phone.getByRole('button', { name: 'Stop camera' }).click();
  await expect(laptop.getByText('Phone connected', { exact: true })).toBeVisible();
  await expect(expressionTitle(laptop)).toHaveText('Waiting for phone camera…');

  // Closing the phone page is reported on the laptop.
  await phone.close();
  await expect(laptop.getByText('Phone disconnected. Please reconnect your phone.')).toBeVisible();
});
