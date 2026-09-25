import { expect, test } from '@playwright/test';
import { expressionTitle, startCamera } from './helpers';

test('after one online visit, detection works offline (service worker)', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker

  // Use the camera once so the model and worker files are cached.
  await startCamera(page);
  await expect(page.getByTestId('face-box').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Stop camera' }).click();
  await page.keyboard.press('Escape');

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText(/You are offline/)).toBeVisible();

  await startCamera(page);
  await expect(page.getByTestId('face-box').first()).toBeVisible({ timeout: 60_000 });
  await expect(expressionTitle(page)).not.toHaveText(/Loading AI model/);
  await context.setOffline(false);
});
