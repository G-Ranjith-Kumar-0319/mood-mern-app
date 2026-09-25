import { expect, test } from '@playwright/test';
import { expressionTitle, startCamera } from './helpers';

test('shows "No face detected" for a camera feed without a face', async ({ page }) => {
  await page.goto('/');
  await startCamera(page);
  await expect(expressionTitle(page)).toHaveText('No face detected', { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Save now' })).toBeDisabled();
});
